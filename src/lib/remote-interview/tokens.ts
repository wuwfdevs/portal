// Pure, dependency-free helpers for join links: token generation, storage
// prefixes, and expiry/revocation state. Kept testable under Vitest without
// mocking Supabase, per CLAUDE.md's testing expectations — this is the
// "token generation" and "status derivation" pure logic the design doc
// (docs/remote-interview-design.md, "Fit with portal conventions") calls out.

import { randomBytes } from "node:crypto";

/** Default validity window for a freshly created guest join link. */
export const JOIN_LINK_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** A 256-bit random, base64url join token — the capability itself (design doc §3A/§5). */
export function generateJoinToken(): string {
  return randomBytes(32).toString("base64url");
}

/** This participant's object prefix in the remote-interview-media bucket. */
export function storagePrefixFor(sessionId: string, participantId: string): string {
  return `${sessionId}/${participantId}`;
}

/** A sensible default expiry for a new guest link, relative to `now`. */
export function defaultTokenExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + JOIN_LINK_DEFAULT_TTL_MS);
}

/**
 * Whether a join link can still be used to reach preflight/the studio: not
 * revoked, and either has no expiry (the host's own unused token) or hasn't
 * passed it yet.
 */
export function isJoinLinkActive(
  participant: { revokedAt: string | null; tokenExpiresAt: string | null },
  now: Date = new Date(),
): boolean {
  if (participant.revokedAt) return false;
  if (!participant.tokenExpiresAt) return true;
  return new Date(participant.tokenExpiresAt).getTime() > now.getTime();
}
