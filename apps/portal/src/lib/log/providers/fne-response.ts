// Parses the Florida News Exchange RSS feed (PRX Networks) into plain items —
// pure, no fetch and no Supabase, colocated test. The feed is ordinary RSS 2.0
// with no namespaces: title, description, pubDate, guid, link, enclosure.
//
// Two things about it shape this file:
//   - It carries no duration, byline, or station. Don't invent them; the
//     description (the copy, with pronunciation guides and station tags) is
//     shown verbatim.
//   - The enclosure URL is a signed S3 link that expires an hour after the feed
//     was read. Never store one for later; `link` (the PRX item page) is the
//     durable reference and the item's `guid` is its stable id.
//
// There is no XML dependency in this repo and the feed is flat, so this reads
// it with small tag scans rather than a general parser.

import { collapseWhitespace } from "@/lib/text";

export interface FneItem {
  /** The feed's own guid (the PRX item URL) — the stable id. */
  guid: string;
  /** The title exactly as filed. */
  rawTitle: string;
  /** The title with its production tag (WRAP, CUT, "(Super)", …) taken off. */
  title: string;
  kind: FneItemKind;
  /** A "hold until…" / "for Thursday" note from the title, if it carried one. */
  holdNote: string | null;
  /** The copy, verbatim — pronunciation guides and station tags included. */
  description: string;
  /** ISO instant. */
  publishedAt: string;
  /** The PRX item page. */
  link: string;
  audioUrl: string | null;
  /** Size of the audio file in bytes, when the feed says. */
  audioBytes: number | null;
}

export type FneItemKind = "wrap" | "cut" | "voicer" | "super" | "other";

export const FNE_KIND_LABELS: Record<FneItemKind, string> = {
  wrap: "Wrap",
  cut: "Cut",
  voicer: "Voicer",
  super: "Super",
  other: "Story",
};

const NAMED_ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&(lt|gt|quot|apos|nbsp);/g, (_, name: string) => NAMED_ENTITIES[name]!)
    .replace(/&amp;/g, "&");
}

function safeCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

function tagText(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(block);
  if (!match) return null;
  const inner = match[1]!;
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(inner);
  return cdata ? cdata[1]! : decodeEntities(inner);
}

function enclosureOf(block: string): { url: string | null; bytes: number | null } {
  const match = /<enclosure\s+([^>]*?)\/?>/.exec(block);
  if (!match) return { url: null, bytes: null };
  const attrs: Record<string, string> = {};
  for (const attr of match[1]!.matchAll(/((?:\w|:|-)+)="([^"]*)"/g)) {
    attrs[attr[1]!] = decodeEntities(attr[2]!);
  }
  const bytes = Number(attrs.length);
  return {
    url: attrs.url ? attrs.url : null,
    bytes: Number.isFinite(bytes) && bytes > 0 ? bytes : null,
  };
}

const KIND_WORDS: Record<string, FneItemKind> = {
  wrap: "wrap",
  cut: "cut",
  voicer: "voicer",
  super: "super",
};

/**
 * Reads the production tag stations put on a title — a leading "WRAP - ",
 * "CUT: ", "VOICER - ", "(cut) ", "(Super) ", or a trailing " WRAP" — plus a
 * "(Hold until 10/8)" or "FOR THURS:" note. Anything else is left in the title.
 */
export function parseFneTitle(rawTitle: string): {
  title: string;
  kind: FneItemKind;
  holdNote: string | null;
} {
  let title = collapseWhitespace(rawTitle);
  let kind: FneItemKind = "other";
  let holdNote: string | null = null;

  const hold = /^\((hold[^)]*)\)\s*/i.exec(title);
  if (hold) {
    holdNote = hold[1]!.trim();
    title = title.slice(hold[0].length);
  }
  const forDay = /^for\s+([a-z]+\.?)\s*:\s*/i.exec(title);
  if (forDay) {
    holdNote = `For ${forDay[1]!.replace(/\.$/, "")}`;
    title = title.slice(forDay[0].length);
  }

  const leading =
    /^(?:\(\s*(wrap|cut|voicer|super)\s*\)|(wrap|cut|voicer|super)\s*(?:-|:|\u2013)\s*)\s*/i.exec(
      title,
    );
  if (leading) {
    kind = KIND_WORDS[(leading[1] ?? leading[2]!).toLowerCase()]!;
    title = title.slice(leading[0].length);
  } else {
    const trailing = /\s+(wrap|cut|voicer)$/.exec(title.toLowerCase());
    if (trailing) {
      kind = KIND_WORDS[trailing[1]!]!;
      title = title.slice(0, title.length - trailing[0].length);
    }
  }

  return { title: title.trim(), kind, holdNote };
}

/** Every item in the feed, in feed order (newest first). An item with no guid or date is skipped. */
export function parseFneFeed(xml: string): FneItem[] {
  const items: FneItem[] = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = match[1]!;
    const rawTitle = tagText(block, "title")?.trim() ?? "";
    const guid = tagText(block, "guid")?.trim();
    const pubDate = tagText(block, "pubDate")?.trim();
    const published = pubDate ? new Date(pubDate) : null;
    if (!guid || !published || Number.isNaN(published.getTime())) continue;

    const { title, kind, holdNote } = parseFneTitle(rawTitle);
    const enclosure = enclosureOf(block);
    items.push({
      guid,
      rawTitle,
      title: title || rawTitle,
      kind,
      holdNote,
      description: (tagText(block, "description") ?? "").trim(),
      publishedAt: published.toISOString(),
      link: tagText(block, "link")?.trim() || guid,
      audioUrl: enclosure.url,
      audioBytes: enclosure.bytes,
    });
  }
  return items;
}

export interface FneStory {
  /** The cleaned title the versions share. */
  title: string;
  /** Newest version first. */
  versions: FneItem[];
  latestAt: string;
}

/**
 * Groups versions of one story — a WRAP and its CUT, a voicer and its wrap —
 * which stations file separately under the same headline. Matched on the
 * cleaned title, case- and punctuation-insensitive; order follows each
 * story's newest version.
 */
export function groupFneStories(items: readonly FneItem[]): FneStory[] {
  const stories = new Map<string, FneStory>();
  for (const item of items) {
    const key = item.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const story = stories.get(key);
    if (story) {
      story.versions.push(item);
      if (item.publishedAt > story.latestAt) story.latestAt = item.publishedAt;
    } else {
      stories.set(key, { title: item.title, versions: [item], latestAt: item.publishedAt });
    }
  }
  return [...stories.values()]
    .map((story) => ({
      ...story,
      versions: [...story.versions].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    }))
    .sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}

export const FNE_WINDOW_HOURS = 24;

/** Items published within the last `hours` hours of `now`; a future-dated item (clock skew) counts as recent. */
export function withinLastHours(
  items: readonly FneItem[],
  now: Date,
  hours: number = FNE_WINDOW_HOURS,
): FneItem[] {
  const cutoff = now.getTime() - hours * 3_600_000;
  return items.filter((item) => new Date(item.publishedAt).getTime() >= cutoff);
}
