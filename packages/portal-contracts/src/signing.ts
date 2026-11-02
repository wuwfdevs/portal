// Server-to-server request signing for the publish and transcription channels. The signature
// covers the method, path, timestamp and a hash of the exact body, so a captured request cannot be
// replayed against another path, with another body, or after the window closes. A distinct secret
// is used per channel (and per direction), so a leak of one does not authorize the others.

import { fromBase64Url, hmacSha256, hmacSha256Verify, sha256Hex, toBase64Url } from "./encoding";

export const SIGNATURE_HEADER = "x-wuwf-signature";
export const TIMESTAMP_HEADER = "x-wuwf-timestamp";
export const CONTRACT_VERSION_HEADER = "x-wuwf-contract-version";
/** Bump on a breaking change to any message; receivers refuse versions they don't know. */
export const CONTRACT_VERSION = "1";
/** How far a request's timestamp may be from the receiver's clock. */
export const REQUEST_WINDOW_SECONDS = 300;

export interface SignInput {
  method: string;
  /** Path and query, exactly as sent, e.g. "/api/portal/publish-candidates". */
  path: string;
  body: string;
  now?: number;
}

export interface SignedHeaders {
  [SIGNATURE_HEADER]: string;
  [TIMESTAMP_HEADER]: string;
  [CONTRACT_VERSION_HEADER]: string;
}

async function canonical(method: string, path: string, timestamp: string, body: string): Promise<string> {
  return [CONTRACT_VERSION, method.toUpperCase(), path, timestamp, await sha256Hex(body)].join("\n");
}

export async function signRequest(input: SignInput, secret: string): Promise<SignedHeaders> {
  const timestamp = String(input.now ?? Math.floor(Date.now() / 1000));
  const message = await canonical(input.method, input.path, timestamp, input.body);
  return {
    [SIGNATURE_HEADER]: toBase64Url(await hmacSha256(secret, message)),
    [TIMESTAMP_HEADER]: timestamp,
    [CONTRACT_VERSION_HEADER]: CONTRACT_VERSION,
  };
}

export type SignatureFailure = "missing_headers" | "unsupported_version" | "bad_timestamp" | "outside_window" | "bad_signature";
export type SignatureResult = { ok: true } | { ok: false; reason: SignatureFailure };

export async function verifyRequestSignature(
  input: SignInput & { signature: string | null; timestamp: string | null; version: string | null },
  secret: string,
  now: number = Math.floor(Date.now() / 1000),
): Promise<SignatureResult> {
  if (!input.signature || !input.timestamp || !input.version) return { ok: false, reason: "missing_headers" };
  if (input.version !== CONTRACT_VERSION) return { ok: false, reason: "unsupported_version" };
  if (!/^\d{1,12}$/.test(input.timestamp)) return { ok: false, reason: "bad_timestamp" };
  if (Math.abs(now - Number(input.timestamp)) > REQUEST_WINDOW_SECONDS) return { ok: false, reason: "outside_window" };
  const sig = fromBase64Url(input.signature);
  if (!sig) return { ok: false, reason: "bad_signature" };
  const message = await canonical(input.method, input.path, input.timestamp, input.body);
  return (await hmacSha256Verify(secret, message, sig)) ? { ok: true } : { ok: false, reason: "bad_signature" };
}
