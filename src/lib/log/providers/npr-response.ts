// Pure parsing for NPR's Content Distribution Service (CDS) `GET
// /v1/documents` response, isolated behind this module so CDS-specific JSON
// shape never leaks past the provider boundary (see npr.ts, which is the
// only caller). No fetch, no Supabase, no "server-only" — dependency-free
// and colocated-tested, per this repo's convention for pure logic.
//
// This repo has no live CDS credentials to verify a real response against
// (see CLAUDE.md's NPR CDS correction note), so this parser is deliberately
// tolerant of a couple of plausible field-naming variants rather than
// committing to one exact shape, while still failing clearly — never
// inventing content — for anything it doesn't recognize at all.

export interface NprEpisodeItem {
  npr_item_id: string;
  title: string;
  teaser: string | null;
  raw: unknown;
}

export type NprEpisodeFetchResult =
  | { status: "found"; npr_episode_id: string; title: string | null; items: NprEpisodeItem[]; raw: unknown }
  | { status: "not_found" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Finds the array of candidate documents in a CDS documents response.
 * Tolerant of the `{ list: { items: [...] } }` wrapper NPR's APIs are
 * documented to use, a bare `{ items: [...] }`, or a plain array. Returns
 * null when nothing recognizable is found at all — the caller treats that
 * as a malformed response, distinct from a recognized-but-empty result.
 */
function extractDocumentArray(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (!isRecord(body)) return null;

  const list = body.list;
  if (isRecord(list) && Array.isArray(list.items)) return list.items;
  if (Array.isArray(body.items)) return body.items;

  return null;
}

/**
 * Whether a document is usable as the program-episode result. The request
 * itself already asks CDS to filter by `profileIds=program-episode`, so a
 * document with no profile field at all is trusted; one that *does* declare
 * a profile and it doesn't match is skipped, as a defense against an
 * unrelated document slipping through.
 */
function isUsableEpisodeDocument(doc: Record<string, unknown>): boolean {
  const profileIds = doc.profileIds;
  if (Array.isArray(profileIds)) return profileIds.includes("program-episode");
  const profileId = doc.profileId;
  if (typeof profileId === "string") return profileId === "program-episode";
  return true;
}

/**
 * Extracts the ordered item collection nested under an episode document's
 * transcluded `items` (`transclude=items` in the request). Tolerant of
 * `{ items: { items: [...] } }` (CDS's own transclusion wrapper) or a bare
 * `{ items: [...] }`. Missing/empty is a legitimate empty item list, not an
 * error — a freshly published episode may not have any yet.
 */
function extractItemDocuments(episodeDoc: Record<string, unknown>): unknown[] {
  const items = episodeDoc.items;
  if (Array.isArray(items)) return items;
  if (isRecord(items) && Array.isArray(items.items)) return items.items;
  return [];
}

/**
 * Normalizes one CDS item document. Drops an item with no usable id — the
 * stable NPR identity is the one thing this integration must never invent
 * (see docs/log-design.md §5, "do not use titles as identifiers") — but
 * otherwise degrades gracefully: a missing title becomes a placeholder
 * rather than dropping real content, and teaser/description are optional.
 */
function normalizeItem(raw: unknown): NprEpisodeItem | null {
  if (!isRecord(raw)) return null;
  const npr_item_id = readString(raw, "id");
  if (!npr_item_id) return null;

  const title = readString(raw, "title") ?? "(untitled)";
  const teaser = readString(raw, "teaser") ?? readString(raw, "miniTeaser") ?? readString(raw, "description");

  return { npr_item_id, title, teaser, raw };
}

/**
 * Parses a CDS `GET /v1/documents` response for a program-episode lookup.
 * Throws only when the response doesn't match any recognized shape at all —
 * a recognized-but-empty result (no document matched the profile/date/
 * collection query) is `{ status: "not_found" }`, a legitimate outcome, not
 * an error. Item order is preserved exactly as CDS returned it.
 */
export function parseCdsProgramEpisodeResponse(body: unknown): NprEpisodeFetchResult {
  const documents = extractDocumentArray(body);
  if (documents === null) {
    throw new Error("NPR CDS returned a response this integration doesn't recognize.");
  }

  const episodeDoc = documents.find(
    (doc): doc is Record<string, unknown> => isRecord(doc) && isUsableEpisodeDocument(doc),
  );
  if (!episodeDoc) return { status: "not_found" };

  const npr_episode_id = readString(episodeDoc, "id");
  if (!npr_episode_id) {
    throw new Error("NPR CDS returned a program-episode document with no usable id.");
  }

  const title = readString(episodeDoc, "title");
  const items = extractItemDocuments(episodeDoc)
    .map(normalizeItem)
    .filter((item): item is NprEpisodeItem => item !== null);

  return { status: "found", npr_episode_id, title, items, raw: episodeDoc };
}
