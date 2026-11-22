import "server-only";
import {
  CONTRACT_VERSION_HEADER,
  SIGNATURE_HEADER,
  STAFF_ACTIONS_SECRET_MIN_LENGTH,
  TIMESTAMP_HEADER,
  verifyRequestSignature,
  type StaffActionErrorCode,
} from "@wuwf/portal-contracts";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The one receiver for the site's signed STAFF ACTIONS channel (packages/portal-contracts, staff-actions.ts): everything the site does on behalf
 * of a named staff member. A feature supplies its tool key, how to read its requests and what to do; it never repeats these checks, and it adds
 * no secret. The checks stand in for the session and the row-level policies a staff screen has, because there is no session here and the admin
 * client ignores policies:
 *   1. the channel's secret (`STAFF_ACTIONS_SECRET`), checked against the signature before anything else;
 *   2. the ACTOR the request names must be an active account holding an unrevoked grant for the feature's tool, looked up here (no administrator
 *      bypass, as in the private.has_*_access functions); the site's word that someone is staff is never enough.
 * A body is never logged (it can name people): only the feature, the action, the refusal code and the database's own error code.
 */

const MAX_BODY_BYTES = 64 * 1024;

export type Supabase = ReturnType<typeof createAdminClient>;

const STATUS: Record<StaffActionErrorCode, number> = { not_allowed: 403, not_found: 404, invalid: 400, conflict: 409, rate_limited: 429, unavailable: 503 };

function respond(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export function refuse(error: StaffActionErrorCode, message?: string, status = STATUS[error]): Response {
  return respond(status, { ok: false, error, ...(message ? { message } : {}) });
}

/** A refusal a feature throws from `run`: the code and, except for `not_allowed`, a sentence for the person who typed it. */
export class Refusal extends Error {
  constructor(
    readonly code: StaffActionErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** A database error already logged by its code; the caller answers "unavailable". */
export class DatabaseFailure extends Error {}

/** The result's data, or a thrown `DatabaseFailure` (after logging the code, never the text) when it carries an error. */
export function check<T>(result: { data: T | null; error: { code?: string; message: string } | null }, what: string): T | null {
  if (result.error) {
    console.error(`Staff actions: ${what} failed (${result.error.code ?? "no code"})`);
    throw new DatabaseFailure(what);
  }
  return result.data;
}

export type StaffParse<C> = { ok: true; value: C } | { ok: false; message: string };

export interface StaffActionFeature<C extends { actor: string }> {
  /** For the log only, e.g. "listening/save". */
  label: string;
  /** The `tools.key` whose grant the actor must hold. */
  toolKey: string;
  parse(json: unknown): StaffParse<C>;
  run(supabase: Supabase, call: C): Promise<Record<string, unknown>>;
}

export async function receiveStaffAction<C extends { actor: string }>(request: Request, feature: StaffActionFeature<C>): Promise<Response> {
  const secret = process.env.STAFF_ACTIONS_SECRET;
  if (!secret || secret.length < STAFF_ACTIONS_SECRET_MIN_LENGTH) {
    console.error("The staff actions API is not configured: STAFF_ACTIONS_SECRET is missing or shorter than 32 characters.");
    return refuse("unavailable");
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return refuse("invalid", "That is too much to send at once.", 413);
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return refuse("invalid", "That is too much to send at once.", 413);

  // The signature covers the path as sent. These routes take no query string, so a stray one is refused.
  const url = new URL(request.url);
  if (url.search) return refuse("invalid");

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
    console.error(`Staff actions: refused ${feature.label}: ${signed.reason}`);
    return respond(401, { ok: false, error: "invalid" });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return refuse("invalid");
  }
  const parsed = feature.parse(json);
  if (!parsed.ok) return refuse("invalid", parsed.message);
  const call = parsed.value;

  try {
    const supabase = createAdminClient();
    if (!(await actorHoldsTool(supabase, call.actor, feature.toolKey))) return refuse("not_allowed");
    return respond(200, { ok: true, ...(await feature.run(supabase, call)) });
  } catch (error) {
    if (error instanceof Refusal) return refuse(error.code, error.code === "not_allowed" ? undefined : error.message);
    if (!(error instanceof DatabaseFailure)) console.error(`Staff actions: ${feature.label} failed unexpectedly:`, error instanceof Error ? error.name : "unknown");
    return refuse("unavailable");
  }
}

/** An active account holding an unrevoked grant for the tool. */
export async function actorHoldsTool(supabase: Supabase, actor: string, toolKey: string): Promise<boolean> {
  const tool = await supabase.from("tools").select("id").eq("key", toolKey).maybeSingle();
  check(tool, "reading the tool");
  if (!tool.data) return false;
  const profile = await supabase.from("profiles").select("account_status").eq("id", actor).maybeSingle();
  check(profile, "reading the profile");
  if (profile.data?.account_status !== "active") return false;
  const grant = await supabase.from("tool_access").select("user_id").eq("user_id", actor).eq("tool_id", tool.data.id).is("revoked_at", null).maybeSingle();
  check(grant, "reading the grant");
  return grant.data !== null;
}
