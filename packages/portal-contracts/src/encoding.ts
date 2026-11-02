// base64url and constant-time-safe HMAC on the Web Crypto API (Node 19+, every browser, edge runtimes),
// so this package needs no Node built-in.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const bin = atob(padded);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export const utf8 = (s: string): Uint8Array => enc.encode(s);
export const fromUtf8 = (b: Uint8Array): string => dec.decode(b);

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error("Signing secrets must be at least 32 characters");
  return globalThis.crypto.subtle.importKey("raw", utf8(secret) as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const sig = await globalThis.crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), utf8(message) as BufferSource);
  return new Uint8Array(sig);
}

/** Verifies through subtle.verify, which compares in constant time. */
export async function hmacSha256Verify(secret: string, message: string, signature: Uint8Array): Promise<boolean> {
  return globalThis.crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), signature as BufferSource, utf8(message) as BufferSource);
}

export async function sha256Hex(message: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", utf8(message) as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
