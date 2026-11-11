import "server-only";
import {
  CONTRACT_VERSION_HEADER,
  LISTENING_SECRET_MIN_LENGTH,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifyRequestSignature,
  type ListeningErrorCode,
} from "@wuwf/portal-contracts";
import { createAdminClient } from "@/lib/supabase/admin";
import { AUDIENCE_LISTENING_MEDIA_BUCKET } from "@/lib/audience-listening/media";
import { generateJoinToken, hashJoinToken } from "@/lib/audience-listening/table-links";
import {
  parseListeningRequest,
  rateKeys,
  requiresEnabledTool,
  shapeResponse,
  statusForError,
  type ListeningAction,
  type ParsedListeningRequest,
} from "@/lib/audience-listening/site-api-shapes";

/**
 * The receiver for the site's signed listening API (docs/audience-listening-suite-design.md §4).
 *
 * This is the one place the admin client touches listening data, and it touches it only by calling the al_site_*
 * functions, which only service_role can execute: no table is read or written directly. The signature check below
 * stands in for the session RLS would otherwise have, so it runs before anything else, as in the transcription
 * webhook. A request body is never logged (answers carry names, emails and phone numbers): only the action, the
 * refusal code and the subject's namespace.
 */

/** A listening call is small JSON. Anything larger is not one. */
const MAX_BODY_BYTES = 32 * 1024;

/** How long Storage keeps a signed upload address valid. It is fixed by Storage (two hours) and cannot be shortened. */
const SIGNED_UPLOAD_SECONDS = 2 * 60 * 60;

function respond(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function refuse(code: ListeningErrorCode, status = statusForError(code)): Response {
  return respond(status, { ok: false, error: code });
}

export async function handleListeningRequest(request: Request, action: ListeningAction): Promise<Response> {
  const secret = process.env.LISTENING_SIGNING_SECRET;
  if (!secret || secret.length < LISTENING_SECRET_MIN_LENGTH) {
    console.error("The listening API is not configured: LISTENING_SIGNING_SECRET is missing or shorter than 32 characters.");
    return refuse("unavailable");
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return refuse("invalid_request", 413);
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return refuse("invalid_request", 413);

  // The signature covers the path as sent. These routes take no query string, so a stray one is refused.
  const url = new URL(request.url);
  if (url.search) return refuse("invalid_request");

  const signed = await verifyRequestSignature(
    {
      method: request.method,
      path: url.pathname,
      body: raw,
      signature: request.headers.get(SIGNATURE_HEADER),
      timestamp: request.headers.get(TIMESTAMP_HEADER),
      version: request.headers.get(CONTRACT_VERSION_HEADER),
    },
    secret,
  );
  if (!signed.ok) {
    console.error(`Listening API: refused ${action}: ${signed.reason}`);
    return respond(401, { ok: false, error: "invalid_request" });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return refuse("invalid_request");
  }
  const parsed = parseListeningRequest(action, json);
  if (!parsed.ok) return refuse(parsed.error);
  const call = parsed.request;

  // A table's session is made here, not in the parser: the token is random, and only its hash goes to the database.
  let sessionToken: string | null = null;
  if (action === "table-open") {
    sessionToken = generateJoinToken();
    call.rpc.args.p_session_hash = hashJoinToken(sessionToken);
  }

  const supabase = createAdminClient();

  if (requiresEnabledTool(action)) {
    const { data: tool, error } = await supabase.from("tools").select("enabled").eq("key", "audience-listening").maybeSingle();
    if (error) {
      console.error(`Listening API: could not read the tool registry for ${action}:`, error.message);
      return refuse("unavailable");
    }
    if (!tool?.enabled) return refuse("not_accepting");
  }

  if (!(await withinRateLimits(supabase, call))) return refuse("rate_limited");

  const result = await callFunction(supabase, call);
  if (result.failed) {
    console.error(`Listening API: ${action} failed in the database: ${result.message}`);
    return refuse("unavailable");
  }

  const shaped = shapeResponse(action, result.data);
  if (!shaped.ok) {
    if (shaped.error === "unavailable") console.error(`Listening API: ${action} returned an unexpected shape`);
    return refuse(shaped.error);
  }

  if (action === "reserve-answer") return reserveAnswerResponse(supabase, call, shaped.body);
  if (action === "table-segment") return tableSegmentResponse(supabase, call, shaped.body);
  if (action === "table-open" && sessionToken) {
    const { sessionExpiresAt, ...rest } = shaped.body;
    return respond(200, { ok: true, ...rest, session: { token: sessionToken, expiresAt: sessionExpiresAt } });
  }
  if (action === "forget-subject") await removeForgottenAudio(supabase, result.data);

  return respond(200, { ok: true, ...shaped.body });
}

type Admin = ReturnType<typeof createAdminClient>;

/** Counts each rule's window. A failing limiter must not take listening down, so an error is logged and allowed. */
async function withinRateLimits(supabase: Admin, call: ParsedListeningRequest): Promise<boolean> {
  for (const { key, rule } of rateKeys(call)) {
    const { data, error } = await supabase.rpc("al_site_rate_hit", {
      p_key: key,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });
    if (error) {
      console.error(`Listening API: the rate limiter failed for ${call.action}:`, error.message);
      continue;
    }
    if (data === false) return false;
  }
  return true;
}

async function callFunction(
  supabase: Admin,
  call: ParsedListeningRequest,
): Promise<{ failed: false; data: unknown } | { failed: true; message: string }> {
  // The function names and argument shapes come only from parseListeningRequest, never from the body directly.
  // The generated types are a union over every function, so the call is cast at this one seam.
  const rpc = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc.call(supabase, call.rpc.fn, call.rpc.args);
  if (error) return { failed: true, message: error.message };
  return { failed: false, data };
}

/** Mints the signed address a browser PUTs one reserved object to: a raw body, the content type pinned, upsert so a redo overwrites. */
async function mintUpload(
  supabase: Admin,
  storagePath: string,
  contentType: string,
): Promise<{ url: string; method: "PUT"; headers: Record<string, string>; expiresAt: string } | null> {
  const { data, error } = await supabase.storage.from(AUDIENCE_LISTENING_MEDIA_BUCKET).createSignedUploadUrl(storagePath, { upsert: true });
  if (error || !data?.signedUrl) {
    console.error("Listening API: could not mint a signed upload address:", error?.message ?? "no address returned");
    return null;
  }
  return {
    url: data.signedUrl,
    method: "PUT",
    headers: { "content-type": contentType, "x-upsert": "true" },
    expiresAt: new Date(Date.now() + SIGNED_UPLOAD_SECONDS * 1000).toISOString(),
  };
}

/** The row exists before the bytes: reserve it, then mint the address the browser uploads to. */
async function reserveAnswerResponse(supabase: Admin, call: ParsedListeningRequest, body: Record<string, unknown>): Promise<Response> {
  const storagePath = body["storagePath"];
  if (typeof storagePath !== "string" || !call.contentType) return refuse("unavailable");
  const upload = await mintUpload(supabase, storagePath, call.contentType);
  if (!upload) return refuse("unavailable");

  const { storagePath: _omit, ...rest } = body;
  void _omit;
  return respond(200, { ok: true, ...rest, upload });
}

/** A table's segment: the same, unless the segment is already uploaded, in which case there is nothing to send. */
async function tableSegmentResponse(supabase: Admin, call: ParsedListeningRequest, body: Record<string, unknown>): Promise<Response> {
  if (body["alreadyUploaded"] === true) return respond(200, { ok: true, ...body });
  const storagePath = body["storagePath"];
  if (typeof storagePath !== "string" || !call.contentType) return refuse("unavailable");
  const upload = await mintUpload(supabase, storagePath, call.contentType);
  if (!upload) return refuse("unavailable");

  const { storagePath: _omit, ...rest } = body;
  void _omit;
  return respond(200, { ok: true, ...rest, upload });
}

/** al_site_forget_subject deletes the rows and returns the object keys; the audio goes after, best effort. */
async function removeForgottenAudio(supabase: Admin, payload: unknown): Promise<void> {
  const paths = (payload as { storage_paths?: unknown } | null)?.storage_paths;
  if (!Array.isArray(paths) || paths.length === 0) return;
  const keys = paths.filter((p): p is string => typeof p === "string");
  if (keys.length === 0) return;
  const { error } = await supabase.storage.from(AUDIENCE_LISTENING_MEDIA_BUCKET).remove(keys);
  if (error) console.error(`Listening API: ${keys.length} object(s) could not be removed after a subject was forgotten:`, error.message);
}
