/**
 * A program's NPR mapping as a producer edits it on the program's page: the
 * CDS collection id Log fetches episodes by (lib/log/npr.ts) and the Eastern
 * hour NPR's live feed starts the program's first hour at
 * (lib/log/npr-story-times.ts's episodeHourOffset). Pure, no Supabase.
 */

export interface NprMapping {
  collectionId: number | null;
  feedStartHourEt: number | null;
}

export type NprMappingResult = ({ ok: true } & NprMapping) | { ok: false; error: string };

/** The largest id a Postgres `integer` column holds. */
const MAX_COLLECTION_ID = 2_147_483_647;

/**
 * Parses the two form fields. A blank collection id disconnects the program,
 * and the feed hour goes with it: the hour means nothing without a feed.
 */
export function parseNprMapping(collectionRaw: string, feedHourRaw: string): NprMappingResult {
  const collection = collectionRaw.trim();
  if (collection === "") return { ok: true, collectionId: null, feedStartHourEt: null };
  if (!/^\d+$/.test(collection)) {
    return { ok: false, error: "The NPR collection ID is a whole number, like 3." };
  }
  const collectionId = Number(collection);
  if (collectionId < 1 || collectionId > MAX_COLLECTION_ID) {
    return { ok: false, error: "That NPR collection ID is out of range." };
  }

  const feedHour = feedHourRaw.trim();
  if (feedHour === "") return { ok: true, collectionId, feedStartHourEt: null };
  if (!/^\d{1,2}$/.test(feedHour) || Number(feedHour) > 23) {
    return { ok: false, error: "Choose the NPR feed's first hour from the list." };
  }
  return { ok: true, collectionId, feedStartHourEt: Number(feedHour) };
}

/** An hour of the day (0–23) as "5 AM", "12 PM". */
export function formatHour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${period}`;
}
