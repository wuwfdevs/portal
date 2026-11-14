// The facilitator's after-page link and the organizer's claim link: two more single-use-or-limited secrets of the table link's kind. A
// 256-bit random token is emailed (or shown to staff once) and the database keeps only its SHA-256, so the token exists in the email and
// in nowhere else, never in a log or an audit row. Server side only (node:crypto through table-links).

import { listeningAfterLinkUrl, listeningOrganizerLinkUrl } from "@wuwf/portal-contracts";
import { generateJoinToken, hashJoinToken } from "./table-links";

/** How long the after-page link works, counted from when it is made. */
export const AFTER_LINK_DAYS = 14;
/** The purge removes an unsent conversation thirty days after its event, so a link never outlives what it opens. */
export const AFTER_LINK_LIMIT_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a link made now stops working: fourteen days on, and never later than thirty days after the event. Null once that is past. */
export function afterLinkExpiry(eventEndsAt: Date, now: Date): Date | null {
  const expires = Math.min(now.getTime() + AFTER_LINK_DAYS * DAY_MS, eventEndsAt.getTime() + AFTER_LINK_LIMIT_DAYS * DAY_MS);
  return expires > now.getTime() ? new Date(expires) : null;
}

export interface IssuedAfterLink {
  token: string;
  hash: string;
  url: string;
  expiresAt: Date;
}

export function issueAfterLink(siteOrigin: string, eventEndsAt: Date, now: Date = new Date()): IssuedAfterLink | null {
  const expiresAt = afterLinkExpiry(eventEndsAt, now);
  if (!expiresAt) return null;
  const token = generateJoinToken();
  return { token, hash: hashJoinToken(token), url: listeningAfterLinkUrl(siteOrigin, token), expiresAt };
}

export interface IssuedOrganizerLink {
  token: string;
  hash: string;
  url: string;
}

export function issueOrganizerLink(siteOrigin: string): IssuedOrganizerLink {
  const token = generateJoinToken();
  return { token, hash: hashJoinToken(token), url: listeningOrganizerLinkUrl(siteOrigin, token) };
}

export type AfterLinkStatus = "no_email" | "no_conversation" | "conversation_sent" | "not_sent" | "sent";

/**
 * Where a table stands for the facilitator's link, for the staff screen. A table with no email cannot be sent one; one whose
 * conversation was already sent to the station has nothing left for the facilitator to do.
 */
export function afterLinkStatus(
  table: { facilitator_email: string | null; after_link_sent_at: string | null },
  conversation: { status: string } | null,
): AfterLinkStatus {
  if (!table.facilitator_email) return "no_email";
  if (!conversation) return "no_conversation";
  if (conversation.status === "sent") return "conversation_sent";
  return table.after_link_sent_at ? "sent" : "not_sent";
}

export const AFTER_LINK_STATUS_TEXT: Record<AfterLinkStatus, string> = {
  no_email: "This table has no facilitator email, so there is no one to send the link to. Give them the table's link again, or hand them a link yourself.",
  no_conversation: "Nothing has been recorded at this table yet.",
  conversation_sent: "The facilitator already sent this conversation to the station.",
  not_sent: "No link has been sent. Send it once the transcript is ready.",
  sent: "A link was sent. Sending again makes a new link and the earlier one stops working.",
};

/** Whether a table is one the "email every facilitator" button should reach: it has an email, a conversation not yet sent, and no link yet. */
export function needsAfterLink(table: { facilitator_email: string | null; after_link_sent_at: string | null }, conversation: { status: string } | null): boolean {
  return afterLinkStatus(table, conversation) === "not_sent";
}
