// Searching, filtering and sorting a project's sources on its Sources tab. Pure: the page reads
// every source once and this decides which rows show, so a list of dozens stays scannable without a
// second query. State lives in the URL (`?q=`, `?show=`, `?sort=`), never in the browser.

import type { ExtractionState } from "./run-state";

export type SourceListShow = "all" | "not_analyzed" | "attention";
export type SourceListSort = "date" | "title";

export const SOURCE_SHOW_LABEL: Record<SourceListShow, string> = {
  all: "All",
  not_analyzed: "Not analyzed",
  attention: "Needs attention",
};

export const SOURCE_SORT_LABEL: Record<SourceListSort, string> = {
  date: "Newest first",
  title: "Title",
};

export function parseSourceShow(value: string | undefined): SourceListShow {
  return value === "not_analyzed" || value === "attention" ? value : "all";
}

export function parseSourceSort(value: string | undefined): SourceListSort {
  return value === "title" ? "title" : "date";
}

export interface SourceListRow {
  id: string;
  title: string;
  /** When it was recorded or added, ISO; the sort key for "Newest first". */
  date: string;
  /** The source's own processing status. */
  status: "uploading" | "processing" | "ready" | "failed";
  /** Null when the project has no research state for it (not read on this view). */
  analysis: ExtractionState | null;
}

/** A failed source or a failed Analyze run: something a person has to look at. */
export function needsAttention(row: SourceListRow): boolean {
  return row.status === "failed" || row.analysis?.kind === "failed";
}

/** Ready and never successfully analyzed. */
export function isNotAnalyzed(row: SourceListRow): boolean {
  return row.status === "ready" && row.analysis !== null && row.analysis.kind !== "done";
}

export function countByShow(rows: readonly SourceListRow[]): Record<SourceListShow, number> {
  return {
    all: rows.length,
    not_analyzed: rows.filter(isNotAnalyzed).length,
    attention: rows.filter(needsAttention).length,
  };
}

export function filterSources(
  rows: readonly SourceListRow[],
  options: { query: string; show: SourceListShow; sort: SourceListSort },
): SourceListRow[] {
  const term = options.query.trim().toLowerCase();
  const kept = rows.filter((row) => {
    if (term && !row.title.toLowerCase().includes(term)) return false;
    if (options.show === "not_analyzed") return isNotAnalyzed(row);
    if (options.show === "attention") return needsAttention(row);
    return true;
  });
  return kept.sort((a, b) =>
    options.sort === "title"
      ? a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true })
      : b.date.localeCompare(a.date) || a.title.localeCompare(b.title),
  );
}
