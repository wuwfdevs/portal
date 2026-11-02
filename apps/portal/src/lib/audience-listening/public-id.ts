// Pure, dependency-free helpers for a query's public identifier — the one
// string that ever appears in a public URL. Kept testable under Vitest without
// mocking Supabase, per CLAUDE.md's testing expectations, and shaped exactly
// like lib/remote-interview/tokens.ts's token generation for the same reason:
// the value IS the handle, so how it's made is worth reading in one place.

import { randomBytes } from "node:crypto";

export const PUBLIC_ID_LENGTH = 16;

// 32 characters, lowercase, with the four that get misread out loud or in a
// printed URL removed (l, o, 0, 1). 32 divides 256 exactly, so a plain
// byte % 32 is unbiased — no rejection sampling needed. 16 characters of this
// alphabet is 80 bits: unguessable, and carrying no information about the row.
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** A fresh opaque public id. Server-side only (node:crypto). */
export function generatePublicId(): string {
  const bytes = randomBytes(PUBLIC_ID_LENGTH);
  let id = "";
  for (const byte of bytes) {
    id += ALPHABET[byte % ALPHABET.length];
  }
  return id;
}

/**
 * Whether a string could be one of our public ids. Matches the
 * al_queries_public_id_format CHECK constraint (a superset of the alphabet
 * above), so anything this rejects could never have been stored — which lets
 * the public route answer an obviously-malformed id without a database round
 * trip, and without the shape of the answer differing from a real miss.
 */
export function isValidPublicId(value: string): boolean {
  return /^[a-z0-9]{16}$/.test(value);
}
