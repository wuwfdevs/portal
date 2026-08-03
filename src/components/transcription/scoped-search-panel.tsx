"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import type { SearchResult } from "@/lib/transcription/search";
import { SearchResults } from "./search-results";

const DEBOUNCE_MS = 250;

/**
 * A debounced search box that swaps its own default content for a ranked
 * result list while a query is active — the same "a query replaces the
 * browse surface" behavior the tool-wide /sourcework search box already
 * uses, reused at project scope (the project workspace's own search box)
 * and source scope (the excerpt pane's search box, for a source with
 * hundreds of excerpts) — see docs/sourcework-design.md's search scoping
 * (20260803130000_tw_search_scoping.sql). `onSearch` is whichever scoped
 * Server Action the caller wired up (searchProjectAction/searchSourceAction)
 * — this component doesn't know or care what it's scoped to, only how to
 * render what comes back.
 *
 * `onSearch` is read through a ref rather than a direct effect dependency:
 * a caller passing an inline arrow function (the common case here, closing
 * over a projectId/sourceId) gets a new function identity every render,
 * which would otherwise restart the debounce/fetch on every keystroke's
 * render rather than just on the query actually changing.
 */
export function ScopedSearchPanel({
  placeholder,
  onSearch,
  actions,
  children,
}: {
  placeholder: string;
  onSearch: (query: string) => Promise<SearchResult[]>;
  /** Rendered alongside the search input on the same row (e.g. "+ Add source") — optional, since the source/excerpt-pane callers have nothing to put there. */
  actions?: ReactNode;
  /** The default (no-query) view — a tab switcher, an excerpt list, whatever this panel stands in front of. */
  children: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const trimmed = query.trim();

  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  function handleQueryChange(value: string) {
    setQuery(value);
    // Flips the "Searching…" label on immediately, rather than waiting for
    // the effect below's debounced fetch to start — same split as
    // AddSourceModal's FindExistingPanel (setIsLoading in the change
    // handler, not synchronously inside the effect body, which the
    // react-hooks/set-state-in-effect rule flags).
    if (value.trim()) setIsLoading(true);
  }

  useEffect(() => {
    // Nothing to clear: `results`/`isLoading` are only ever read below while
    // `trimmed` is truthy, so an empty query needs no state reset — just no
    // fetch, which returning here already accomplishes.
    if (!trimmed) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const hits = await onSearchRef.current(trimmed);
      if (!cancelled) {
        setResults(hits);
        setIsLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [trimmed]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Input
          type="search"
          placeholder={placeholder}
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          className="max-w-sm"
        />
        {actions}
      </div>

      {trimmed ? (
        <>
          <p className="mb-3 text-xs text-ink-500">
            {isLoading
              ? "Searching…"
              : `${results.length} result${results.length === 1 ? "" : "s"} for “${trimmed}”`}
          </p>
          {!isLoading && <SearchResults results={results} query={trimmed} />}
        </>
      ) : (
        children
      )}
    </div>
  );
}
