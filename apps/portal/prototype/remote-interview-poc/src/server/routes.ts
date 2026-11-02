import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { ensurePartsDir, listPartSequences, partPath, masterPath } from "./storage-paths.ts";
import { assembleTrack } from "./assembly.ts";
import { verifyWav } from "./verify.ts";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * PUT /api/tracks/:id/parts/:seq — idempotent: if this sequence's file
 * already exists on disk, treat the request as a no-op success. This is the
 * prototype-scale stand-in for the real design's unique(track_id, sequence)
 * constraint, and it's what makes the resume-drain safe to re-run against
 * parts that already made it through before a reload.
 */
async function handlePutPart(
  req: IncomingMessage,
  res: ServerResponse,
  trackId: string,
  sequence: number,
  delayMs: number,
): Promise<void> {
  await ensurePartsDir(trackId);
  const target = partPath(trackId, sequence);

  if (fsSync.existsSync(target)) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    sendJson(res, 200, { ok: true, sequence, deduped: true });
    return;
  }

  const body = await readBody(req);
  // Write to a temp name then rename, so a request that dies mid-write never
  // leaves a truncated file behind that a later listing would treat as real.
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, body);
  await fs.rename(tmp, target);

  // Scenario B (test/scenario-b.ts) uses this to delay the RESPONSE after
  // the write has already durably landed on disk — modeling a page reload
  // that aborts the client's in-flight fetch before it sees the ack, even
  // though the server-side write already succeeded. That's exactly the case
  // the idempotent dedupe check above exists for: the client will retry this
  // same sequence after reload, not knowing the server already has it.
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));

  sendJson(res, 200, { ok: true, sequence, deduped: false, bytes: body.byteLength });
}

async function handleStatus(res: ServerResponse, trackId: string): Promise<void> {
  const sequences = await listPartSequences(trackId);
  sendJson(res, 200, { trackId, sequences, count: sequences.length });
}

async function handleAssemble(res: ServerResponse, trackId: string): Promise<void> {
  try {
    const result = await assembleTrack(trackId);
    sendJson(res, 200, { ok: true, ...result });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleVerify(res: ServerResponse, trackId: string): Promise<void> {
  try {
    const report = await verifyWav(masterPath(trackId));
    sendJson(res, 200, { ok: true, ...report });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

const PUT_PART_RE = /^\/api\/tracks\/([^/]+)\/parts\/(\d+)$/;
const STATUS_RE = /^\/api\/tracks\/([^/]+)\/status$/;
const ASSEMBLE_RE = /^\/api\/tracks\/([^/]+)\/assemble$/;
const VERIFY_RE = /^\/api\/tracks\/([^/]+)\/verify$/;

export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const fullUrl = new URL(req.url ?? "", "http://internal");
  const url = fullUrl.pathname;
  const method = req.method ?? "GET";

  try {
    const putMatch = method === "PUT" && PUT_PART_RE.exec(url);
    if (putMatch) {
      const delayMs = Number(fullUrl.searchParams.get("delayMs") ?? "0") || 0;
      await handlePutPart(req, res, putMatch[1]!, Number(putMatch[2]), delayMs);
      return;
    }

    const statusMatch = method === "GET" && STATUS_RE.exec(url);
    if (statusMatch) {
      await handleStatus(res, statusMatch[1]!);
      return;
    }

    const assembleMatch = method === "POST" && ASSEMBLE_RE.exec(url);
    if (assembleMatch) {
      await handleAssemble(res, assembleMatch[1]!);
      return;
    }

    const verifyMatch = method === "GET" && VERIFY_RE.exec(url);
    if (verifyMatch) {
      await handleVerify(res, verifyMatch[1]!);
      return;
    }

    sendJson(res, 404, { error: "not found", method, url });
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
}
