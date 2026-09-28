// Pure display logic for Resources: the procedure areas, audience labels,
// date formatting, and grouping release notes by the day they shipped. No
// Supabase, no React — colocated test.

import type { RcAudience, RcKind } from "@/lib/database.types";
import { STATION_TIME_ZONE } from "@/lib/log/timezone";
import { parseRichText, type RichTextNode } from "@/lib/rich-text";

/**
 * The tool guides a body links to, in order of first appearance, deduplicated
 * by href — the procedure page's "Tools this uses" card. A link's own text is
 * its label, so no second lookup is needed.
 */
export function guideLinksInBody(body: unknown): { href: string; label: string }[] {
  const doc = parseRichText(body);
  if (!doc) return [];
  const found = new Map<string, string>();
  // A link split across adjacent text nodes (part of it bold, say) is one
  // label; a later link to the same guide keeps the first label.
  let previousHref: string | null = null;
  const walk = (nodes: RichTextNode[]) => {
    for (const node of nodes) {
      if (node.type === "text") {
        const link = node.marks.find((mark) => mark.type === "link");
        const href = link?.type === "link" ? link.attrs.href : null;
        if (href?.startsWith("/resources/tools/")) {
          if (!found.has(href)) found.set(href, node.text);
          else if (previousHref === href) found.set(href, found.get(href) + node.text);
        }
        previousHref = href;
      } else {
        previousHref = null;
        if ("content" in node) walk(node.content);
      }
    }
  };
  walk(doc.content);
  return [...found].map(([href, label]) => ({ href, label: label.trim() }));
}


const AUDIENCE_LABELS: Record<RcAudience, string> = {
  staff: "Staff",
  students: "Students",
  partners: "Partners",
};
const AUDIENCE_ORDER: RcAudience[] = ["staff", "students", "partners"];

/** "Staff, Students" — in a fixed order, whatever order the array was stored in. */
export function formatAudience(audience: readonly RcAudience[]): string {
  return AUDIENCE_ORDER.filter((value) => audience.includes(value))
    .map((value) => AUDIENCE_LABELS[value])
    .join(", ");
}

/**
 * A calendar date ("2026-07-31") as "Jul 31, 2026", or "Jul 31" when `short`.
 * Parsed as UTC and formatted in UTC so the day never shifts.
 */
export function formatReleaseDate(dateISO: string, short = false): string {
  const date = new Date(`${dateISO}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(short ? {} : { year: "numeric" }),
  });
}

/** A timestamp as the station's calendar date, "Sep 12, 2026" (or "Sep 12"). */
export function formatUpdatedDate(iso: string, short = false): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: STATION_TIME_ZONE,
    month: "short",
    day: "numeric",
    ...(short ? {} : { year: "numeric" }),
  });
}

/**
 * Release notes grouped by the day they shipped, newest day first, keeping
 * the input order within a day. Expects notes already sorted newest first;
 * a day that reappears later still joins its first group.
 */
export function groupByReleaseDate<T extends { released_on: string | null }>(
  notes: readonly T[],
): { date: string; notes: T[] }[] {
  const groups: { date: string; notes: T[] }[] = [];
  const byDate = new Map<string, { date: string; notes: T[] }>();
  for (const note of notes) {
    if (!note.released_on) continue;
    let group = byDate.get(note.released_on);
    if (!group) {
      group = { date: note.released_on, notes: [] };
      byDate.set(note.released_on, group);
      groups.push(group);
    }
    group.notes.push(note);
  }
  return groups.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** The URL an article lives at. */
export function articleHref(
  article: { kind: RcKind; slug: string },
  tool: { key: string } | null,
): string {
  switch (article.kind) {
    case "procedure":
      return `/resources/procedures/${article.slug}`;
    case "guide":
      return tool ? `/resources/tools/${tool.key}/${article.slug}` : "/resources";
    case "release_note":
      return `/resources/whats-new#${article.slug}`;
  }
}

export interface ResourceSearchResult {
  title: string;
  summary: string | null;
  kind: RcKind;
  /** The tool a guide or release note is about; null for a procedure or a portal-wide note. */
  tool: string | null;
  url: string;
}

/**
 * Ranked search hits as the assistant sees them (the `resources.search`
 * capability): narrowed to a kind and/or tool when asked, capped, and each
 * carrying the URL the assistant links. Pure — the hits arrive already
 * scoped by RLS to what the caller can read.
 */
export function shapeResourceSearchResults(
  hits: readonly {
    article: { kind: RcKind; slug: string; title: string; summary: string | null };
    tool: { key: string; name: string } | null;
  }[],
  filter: { kind?: RcKind; toolKey?: string; limit: number },
): ResourceSearchResult[] {
  return hits
    .filter((hit) => !filter.kind || hit.article.kind === filter.kind)
    .filter((hit) => !filter.toolKey || hit.tool?.key === filter.toolKey)
    .slice(0, filter.limit)
    .map((hit) => ({
      title: hit.article.title,
      summary: hit.article.summary,
      kind: hit.article.kind,
      tool: hit.tool?.name ?? null,
      url: articleHref(hit.article, hit.tool),
    }));
}

/**
 * The fallback search when every word of a query can't be found in one
 * article: the same words, any of them (websearch_to_tsquery's `or`).
 * Someone typing a whole question — "how do I use the same interview in two
 * projects" — rarely has every word in one guide, and the assistant passes
 * whole questions too. Ranking still puts the article matching the most
 * words first. Null when there's nothing to widen (one word or none).
 */
export function anyWordQuery(query: string): string | null {
  const words = query
    .replace(/["()]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^-+/, ""))
    .filter((word) => word !== "" && !/^(or|and)$/i.test(word));
  return words.length >= 2 ? words.join(" or ") : null;
}

/** Characters of an article embedded — far more than any guide, well within the model's limit. */
const EMBEDDING_INPUT_MAX = 8000;

/**
 * The text an article's embedding describes: exactly what rc_articles.
 * content_hash covers (title, summary, body text), so a changed hash always
 * means a changed input.
 */
export function embeddingInputForArticle(article: {
  title: string;
  summary: string | null;
  body_text: string;
}): string {
  return [article.title, article.summary ?? "", article.body_text]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, EMBEDDING_INPUT_MAX);
}
