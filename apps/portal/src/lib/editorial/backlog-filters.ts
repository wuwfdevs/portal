// The backlog's query-string state (docs/ui-patterns.md, "Filters" and
// "Pagination"): which view, the search term, the three pitch-form filters,
// and the page. Pure, so the parsing, the filter groups the toolbar shows and
// the row test are all tested without Supabase. The backlog filters in JS —
// its lists are small and staleness is derived, not stored — so the same
// module applies the filters the toolbar offers.

import type { EpFieldValue } from "@/lib/database.types";
import type { FilterGroup } from "@/lib/filter-groups";
import { pageHref, parsePage } from "@/lib/pagination";
import { PRIMARY_PILLAR_FIELD_KEY } from "./form";

export const BACKLOG_PATH = "/editorial";
/** The seeded form fields the backlog filters on, by `ep_form_fields.key`. */
export const FORMAT_FIELD_KEY = "format";
export const URGENCY_FIELD_KEY = "urgency";
export const SUMMARY_FIELD_KEY = "summary";

export type BacklogView = "open" | "stale" | "assigned" | "archived";
export const BACKLOG_VIEWS: { key: BacklogView; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "stale", label: "Stale" },
  { key: "assigned", label: "Assigned" },
  { key: "archived", label: "Archived" },
];

export interface BacklogParams {
  view: BacklogView;
  q: string;
  pillar: string;
  format: string;
  urgency: string;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

function one(raw: RawParams, key: string): string {
  const value = raw[key];
  const text = Array.isArray(value) ? value[0] : value;
  return (text ?? "").trim();
}

export function parseBacklogParams(raw: RawParams): BacklogParams {
  const view = one(raw, "view");
  return {
    view: BACKLOG_VIEWS.some((v) => v.key === view) ? (view as BacklogView) : "open",
    q: one(raw, "q"),
    pillar: one(raw, "pillar"),
    format: one(raw, "format"),
    urgency: one(raw, "urgency"),
    page: parsePage(raw.page),
  };
}

/** The query-string fields a backlog link carries; the defaults (Open, page 1) are dropped. */
export function backlogQuery(params: Partial<BacklogParams>): Record<string, string | null> {
  return {
    view: params.view && params.view !== "open" ? params.view : null,
    q: params.q || null,
    pillar: params.pillar || null,
    format: params.format || null,
    urgency: params.urgency || null,
  };
}

/** A backlog URL for the given state, always on page 1 (a changed filter restarts the list). */
export function backlogHref(params: Partial<BacklogParams>): string {
  return pageHref(BACKLOG_PATH, backlogQuery(params), 1);
}

export interface BacklogFilterOptions {
  pillars: string[];
  formats: string[];
  urgencies: string[];
}

/**
 * The toolbar's filter groups: the four views with their counts as chips, then
 * pillar, format and urgency as selects (each has six to ten options; a row of
 * ten chips wraps to three lines). Every group's first chip is its reset.
 */
export function buildBacklogFilterGroups(
  params: BacklogParams,
  counts: Record<BacklogView, number>,
  options: BacklogFilterOptions,
): FilterGroup[] {
  const selectGroup = (
    label: string,
    key: "pillar" | "format" | "urgency",
    reset: string,
    values: string[],
  ): FilterGroup => ({
    label,
    control: "select",
    chips: [
      { label: reset, href: backlogHref({ ...params, [key]: "" }), active: params[key] === "" },
      ...values.map((value) => ({
        label: value,
        href: backlogHref({ ...params, [key]: value }),
        active: params[key] === value,
      })),
    ],
  });

  return [
    {
      label: "Status",
      chips: BACKLOG_VIEWS.map((view) => ({
        label: view.label,
        href: backlogHref({ ...params, view: view.key }),
        active: params.view === view.key,
        count: counts[view.key],
      })),
    },
    selectGroup("Pillar", "pillar", "All pillars", options.pillars),
    selectGroup("Format", "format", "All formats", options.formats),
    selectGroup("Urgency", "urgency", "Any urgency", options.urgencies),
  ];
}

export interface BacklogRowValues {
  title: string;
  /** The pitch's answers keyed by form field key. */
  values: Record<string, EpFieldValue | undefined>;
}

function asText(value: EpFieldValue | undefined): string {
  if (value === undefined || value === null) return "";
  return Array.isArray(value) ? value.join(" ") : String(value);
}

/**
 * Whether a pitch passes the search and the three form filters. The search is
 * a plain case-insensitive substring match over the title and every answer;
 * each filter is an exact match on the field it names.
 */
export function matchesBacklogFilters(params: BacklogParams, row: BacklogRowValues): boolean {
  const q = params.q.toLowerCase();
  if (q) {
    const haystack = [row.title, ...Object.values(row.values).map(asText)].join("\n").toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  if (params.pillar && asText(row.values[PRIMARY_PILLAR_FIELD_KEY]) !== params.pillar) return false;
  if (params.format && asText(row.values[FORMAT_FIELD_KEY]) !== params.format) return false;
  if (params.urgency && asText(row.values[URGENCY_FIELD_KEY]) !== params.urgency) return false;
  return true;
}

/** The pitch's answer for one field, as display text; "" when unanswered. */
export function fieldText(values: Record<string, EpFieldValue | undefined>, key: string): string {
  return asText(values[key]);
}
