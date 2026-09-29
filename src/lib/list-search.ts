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
