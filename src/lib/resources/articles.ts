// Pure display logic for Resources: the procedure areas, audience labels,
// date formatting, and grouping release notes by the day they shipped. No
// Supabase, no React — colocated test.

import type { RcAudience } from "@/lib/database.types";
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

/**
 * The areas a procedure is filed under, in the order the home page's chips
 * show them. rc_articles.area is free text in SQL so a new area needs no
 * migration; this list is what the screens (and, from slice 2, the editor's
 * select) offer.
 */
export const PROCEDURE_AREAS = [
  "On air",
  "News",
  "Engineering",
  "Emergency",
  "Development",
] as const;

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

/** Count per area plus the total, for the home page's "Area" chips. */
export function countByArea(procedures: readonly { area: string | null }[]): {
  all: number;
  byArea: Map<string, number>;
} {
  const byArea = new Map<string, number>();
  for (const procedure of procedures) {
    if (!procedure.area) continue;
    byArea.set(procedure.area, (byArea.get(procedure.area) ?? 0) + 1);
  }
  return { all: procedures.length, byArea };
}
