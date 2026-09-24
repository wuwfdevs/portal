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
  /** The story's audio duration in whole seconds, when the document carries one — see extractAudioDurationSeconds. */
  duration_seconds: number | null;
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
 * Finds the array of candidate documents in a CDS documents response. The
 * real CDS envelope is `{ resources: [...] }` — confirmed against a live
 * token on 2026-08-20, after this parser originally shipped recognizing
 * only the legacy Story API's `{ list: { items: [...] } }` wrapper and
 * failed on every real response. The older tolerances are kept as
 * fallbacks. Returns null when nothing recognizable is found at all — the
 * caller treats that as a malformed response, distinct from a
 * recognized-but-empty result.
 */
function extractDocumentArray(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (!isRecord(body)) return null;

  if (Array.isArray(body.resources)) return body.resources;
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
  // Real CDS documents declare profiles as an array of `{ href, rels }`
  // references (e.g. `{ href: "/v1/profiles/program-episode" }`).
  const profiles = doc.profiles;
  if (Array.isArray(profiles)) {
    return profiles.some(
      (profile) =>
        isRecord(profile) &&
        typeof profile.href === "string" &&
        /\/profiles\/program-episode$/.test(profile.href),
    );
  }
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
 * Extracts the CDS document id from a reference-shaped entry
 * (`{ href: "/v1/documents/<id>", rels: [...] }`) — CDS represents links
 * between documents this way, so an item that arrives as a reference rather
 * than an embedded document still carries CDS's own id in its href. This is
 * still CDS's identifier, never one this integration invents.
 */
function idFromDocumentHref(record: Record<string, unknown>): string | null {
  const href = readString(record, "href");
  if (!href) return null;
  const path = href.split(/[?#]/, 1)[0]!;
  const segments = path.split("/").filter((segment) => segment !== "");
  const last = segments[segments.length - 1];
  return last && last.trim() !== "" ? last : null;
}

/**
 * Extracts a story document's audio duration in seconds. A CDS story's
 * `audio` field is an array of asset references (`{ href: "#/assets/<id>",
 * rels: [...] }`) resolved against the document's own `assets` map, where
 * the audio asset carries a numeric `duration` — confirmed against a live
 * response on 2026-08-21. Prefers the reference marked `primary`; not every
 * story has playable audio (a web-only version's asset has no duration), so
 * null is a legitimate outcome, not an error.
 */
function extractAudioDurationSeconds(doc: Record<string, unknown>): number | null {
  const audio = doc.audio;
  const assets = doc.assets;
  if (!Array.isArray(audio) || !isRecord(assets)) return null;

  const references = audio.filter(isRecord);
  const ordered = [
    ...references.filter((ref) => Array.isArray(ref.rels) && ref.rels.includes("primary")),
    ...references,
  ];
  for (const ref of ordered) {
    const href = readString(ref, "href");
    if (!href) continue;
    const assetId = href.startsWith("#/assets/") ? href.slice("#/assets/".length) : null;
    if (!assetId) continue;
    const asset = assets[assetId];
    if (!isRecord(asset)) continue;
    const duration = asset.duration;
    if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
      return Math.round(duration);
    }
  }
  return null;
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
  // CDS transclusion nests the referenced story document under an `embed`
  // key beside the reference's own href — `{ href: "/v1/documents/<id>",
  // embed: { id, title, teaser, ... } }` — confirmed against a live
  // response on 2026-08-21. Reading only the top level made every real
  // story render "(untitled)" with an href-derived id.
  const doc = isRecord(raw.embed) ? raw.embed : raw;
  const npr_item_id = readString(doc, "id") ?? idFromDocumentHref(raw);
  if (!npr_item_id) return null;

  const title = readString(doc, "title") ?? "(untitled)";
  const teaser = readString(doc, "teaser") ?? readString(doc, "miniTeaser") ?? readString(doc, "description");
  const duration_seconds = extractAudioDurationSeconds(doc);

  return { npr_item_id, title, teaser, duration_seconds, raw };
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
    // Name the keys actually seen so a future shape mismatch is diagnosable
    // straight off the screen — this exact error once cost a deploy/debug
    // round trip because it said nothing about what CDS actually sent.
    const detail = isRecord(body)
      ? ` (top-level keys: ${Object.keys(body).slice(0, 8).join(", ") || "none"})`
      : ` (body was ${Array.isArray(body) ? "an array" : typeof body})`;
    throw new Error(`NPR CDS returned a response this integration doesn't recognize.${detail}`);
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
