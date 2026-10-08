// The outside feeds Log reads, and the one status every one of them reports —
// what the Sources overview (/log/sources) renders as a card per source. Pure,
// no Supabase import, colocated test.
//
// Deliberately only a list and a status: each source keeps its own fetching,
// cache tables, and detail page (NPR is cached per program and show date,
// weather as one current reading — no shared cache shape fits both). Adding a
// source means an entry here, a status loader in lib/log/data-source-status.ts,
// and its own page under /log/sources/.

import {
  checkStaleness,
  FNE_STALE_THRESHOLD_MS,
  NPR_STALE_THRESHOLD_MS,
  WEATHER_STALE_THRESHOLD_MS,
} from "./staleness";

export type DataSourceKey = "npr" | "weather" | "fne";

export interface DataSourceDefinition {
  key: DataSourceKey;
  label: string;
  description: string;
  href: string;
  staleAfterMs: number;
}

export const DATA_SOURCES: readonly DataSourceDefinition[] = [
  {
    key: "npr",
    label: "NPR",
    description:
      "Each program's episode for a show date from NPR's Content Distribution Service, with its stories in order.",
    href: "/log/sources/npr",
    staleAfterMs: NPR_STALE_THRESHOLD_MS,
  },
  {
    key: "weather",
    label: "Weather",
    description: "The National Weather Service forecast for Pensacola, written for on-air reading.",
    href: "/log/sources/weather",
    staleAfterMs: WEATHER_STALE_THRESHOLD_MS,
  },
  {
    key: "fne",
    label: "Florida News Exchange",
    description:
      "Stories other Florida stations share through PRX, with their copy and audio — wraps, cuts and voicers.",
    href: "/log/sources/fne",
    staleAfterMs: FNE_STALE_THRESHOLD_MS,
  },
];

export type DataSourceState = "fresh" | "stale" | "never_fetched" | "not_configured";

export interface DataSourceStatusInput {
  configured: boolean;
  lastUpdatedAt: string | null;
  staleAfterMs: number;
  /** A refresh attempted on this read failed — whatever was saved before is still shown. */
  refreshFailed: boolean;
  nowISO: string;
}

/** One state per source, in the order a reader cares about: can it be used at all, has it ever been read, is it current. */
export function deriveDataSourceState(input: DataSourceStatusInput): DataSourceState {
  if (!input.configured) return "not_configured";
  if (input.lastUpdatedAt === null) return "never_fetched";
  if (input.refreshFailed) return "stale";
  return checkStaleness(input.lastUpdatedAt, input.staleAfterMs, input.nowISO).isStale
    ? "stale"
    : "fresh";
}

export const DATA_SOURCE_STATE_LABELS: Record<DataSourceState, string> = {
  fresh: "Up to date",
  stale: "Stale",
  never_fetched: "Not fetched yet",
  not_configured: "Not configured",
};

/** "15 minutes", "1 hour", "2 hours" — how long a source's saved data counts as current. */
export function formatStaleAfter(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60 || minutes % 60 !== 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = minutes / 60;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/** The pages that belong to the Sources tab — the overview and every source's own page. */
export function isDataSourcesPath(pathname: string): boolean {
  return pathname === "/log/sources" || pathname.startsWith("/log/sources/");
}
