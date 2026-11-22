// Contract 4 — staff actions (site → Portal). One channel for everything the site does ON BEHALF OF A NAMED STAFF MEMBER: writing a listening
// question from the block editor today, and any later feature of the same kind (transcription requests, ...). It is separate from the listener
// channel (listening.ts), and the line between them is WHO ACTS, not which feature: listening speaks for anonymous visitors and the Portal grants
// them almost nothing; a staff action names a person and the Portal checks that person's grant before doing anything.
//
// One secret for the channel: `STAFF_ACTIONS_SECRET` on the Portal, `PORTAL_STAFF_ACTIONS_SECRET` on the site (at least 32 characters, a different
// value per environment, never the listener channel's or the identity channel's). Every request is signed with `signRequest` (signing.ts) over
// the exact body and path. A feature adds paths under `/api/site/staff/<feature>/` and its own messages; it adds no secret.
//
// WHO. Every request names the actor: the Portal user id the site learned when that person signed in through the Portal (the identity token's
// `sub`). The Portal does not take the site's word for what the actor may do. It looks up that person's grant for the feature's tool itself and
// refuses without one. The site's own permission check only decides who is shown a screen.
//
// Types and light shape checks only. Each side validates what it receives.

/** Every staff action lives under this prefix: the Portal lets exactly this prefix past its login redirect and verifies the signature itself. */
export const STAFF_ACTIONS_PATH_PREFIX = "/api/site/staff";

/** Smallest secret length, as for every channel. */
export const STAFF_ACTIONS_SECRET_MIN_LENGTH = 32;

/** A Portal user's id (a UUID). */
export const STAFF_ACTOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fields every staff action carries. */
export interface StaffActionRequestBase {
  actor: { portalUserId: string };
}

/**
 * Every refusal. The codes are the contract; `message` is a sentence the Portal wrote for the person who typed it (a validation problem,
 * "add a question before opening it") and is safe to show as it is. A refusal for `not_allowed` or `unavailable` carries none.
 */
export const STAFF_ACTION_ERROR_CODES = ["not_allowed", "not_found", "invalid", "conflict", "rate_limited", "unavailable"] as const;
export type StaffActionErrorCode = (typeof STAFF_ACTION_ERROR_CODES)[number];

export function isStaffActionErrorCode(value: unknown): value is StaffActionErrorCode {
  return typeof value === "string" && (STAFF_ACTION_ERROR_CODES as readonly string[]).includes(value);
}

export interface StaffActionFailure {
  ok: false;
  error: StaffActionErrorCode;
  message?: string;
}

export type StaffActionResult<T> = ({ ok: true } & T) | StaffActionFailure;
