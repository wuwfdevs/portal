// A table's single-use link: a 256-bit random token the table's phone redeems once, of which the database stores only a SHA-256 hash
// (al_tables.join_token_hash). The token itself exists in two places only: the page that issued it and the card printed from it.
// Staff re-issue a link when a phone is lost or cannot scan; that replaces the hash and clears the used mark, so the old link and any
// session made from it stop working. Server-side only (node:crypto), except the pure QR rendering in qr.ts.

import { createHash, randomBytes } from "node:crypto";
import { LISTENING_TABLE_TOKEN_LENGTH, listeningTableLinkUrl } from "@wuwf/portal-contracts";

/** A fresh table token: 32 random bytes, base64url, 43 characters. */
export function generateJoinToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The SHA-256 of a token, as 64 lowercase hex characters. This is what is stored. */
export function hashJoinToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isJoinToken(value: string): boolean {
  return value.length === LISTENING_TABLE_TOKEN_LENGTH && /^[A-Za-z0-9_-]+$/.test(value);
}

export interface IssuedLink {
  tableId: string;
  number: number;
  token: string;
  hash: string;
  url: string;
}

/** A new link for a table: the token, the hash to store, and the address the QR code and the printed card carry. */
export function issueTableLink(table: { id: string; number: number }, siteOrigin: string): IssuedLink {
  const token = generateJoinToken();
  return { tableId: table.id, number: table.number, token, hash: hashJoinToken(token), url: listeningTableLinkUrl(siteOrigin, token) };
}
