/**
 * The URL a list page's search box navigates to (components/ui/list-search.tsx).
 * Pure, so it's tested without a browser. Keeps the list's other query
 * parameters (the active filter), drops `page` — a new search always starts
 * at page 1, per docs/ui-patterns.md "Pagination" — and drops `q` entirely
 * when the box is empty, so clearing the search returns the bare list.
 */
export function listSearchHref(
  path: string,
  hidden: Record<string, string> | undefined,
  term: string,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(hidden ?? {})) {
    if (key !== "page" && key !== "q" && value) query.set(key, value);
  }
  const trimmed = term.trim();
  if (trimmed) query.set("q", trimmed);
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

/** How long the box waits after the last keystroke before searching. */
export const LIST_SEARCH_DEBOUNCE_MS = 300;

/** `%`, `_` and `\` made literal for a LIKE pattern (Postgres's default escape is a backslash). */
function escapeWildcards(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * A user's search text made safe to put in a PostgREST `ilike` pattern:
 * `%` and `_` (ILIKE wildcards) and `\` are escaped so they match literally —
 * "john_smith" finds john_smith, not johnXsmith. Returns null when nothing
 * searchable is left, so callers can skip the filter. Use as
 * `.ilike("col", `%${term}%`)`. Inside an `or(...)` string use {@link likeTerm}
 * / {@link orIlike} instead. The URL side is `listSearchHref`.
 */
export function ilikeTerm(raw: string | null | undefined): string | null {
  const term = tidy(raw ?? "");
  return term === "" ? null : escapeWildcards(term);
}

/**
 * The same, for a term that goes inside an `or(...)` filter string: commas,
 * parentheses and double quotes are that syntax's own delimiters, so they are
 * dropped (a title with parentheses is matched on the words around them), and a
 * backslash is dropped because the escapes below use it.
 */
export function likeTerm(raw: string | null | undefined): string | null {
  const term = tidy((raw ?? "").replace(/[,()"\\]/g, " "));
  return term === "" ? null : escapeWildcards(term);
}

/**
 * A PostgREST `or` filter matching `raw` against any of `columns`, or null
 * when there is nothing to search for.
 */
export function orIlike(columns: readonly string[], raw: string | null | undefined): string | null {
  const term = likeTerm(raw);
  if (term === null) return null;
  return columns.map((column) => `${column}.ilike.%${term}%`).join(",");
}
