/**
 * Page-number pagination for list pages — the one approach every list in the
 * portal uses (docs/ui-patterns.md, "Pagination"). Pure, so it's tested
 * without Supabase; the query applies `pageRange()` with
 * `.range(from, to)` and asks for `{ count: "exact" }` on the same select, and
 * the screen renders `<Pagination>` from `pageInfo()`.
 *
 * Page numbers, not cursors: these lists are sorted by name or date, a
 * reader wants to know how many there are and jump back to where they were,
 * and none is large enough for OFFSET to cost anything.
 */

export const DEFAULT_PAGE_SIZE = 25;

/** The `?page=` value as a page number: 1 for anything missing or malformed. */
export function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

/** The inclusive row range for `.range(from, to)`. */
export function pageRange(
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  /** 1-based position of the first and last row shown; both 0 when there are none. */
  first: number;
  last: number;
}

export function pageInfo(
  page: number,
  total: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): PageInfo {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return { page, pageSize, total, pageCount, first, last };
}

/**
 * True when the requested page is past the end — a bookmarked `?page=9` after
 * rows were deleted, say. The screen redirects to `pageHref(..., pageCount)`
 * rather than rendering an empty page that looks like an empty list.
 */
export function isPastLastPage(info: PageInfo): boolean {
  return info.total > 0 && info.page > info.pageCount;
}

/**
 * The URL for one page of a list, keeping its other query parameters (search,
 * filters). Page 1 is the bare URL, so it matches the link every filter chip
 * already builds. Empty parameters are dropped.
 */
export function pageHref(
  path: string,
  params: Record<string, string | null | undefined>,
  page: number,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key !== "page" && value) query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

/**
 * Which page numbers to show as links: the first, the last, and the current
 * page with one neighbour each side, with `null` for each gap.
 * 1 … 4 5 6 … 12
 */
export function pageNumbers(page: number, pageCount: number): (number | null)[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const shown = new Set([1, pageCount, page - 1, page, page + 1]);
  // Near either end, show enough pages that a gap never hides just one page.
  if (page <= 3) [2, 3, 4].forEach((n) => shown.add(n));
  if (page >= pageCount - 2)
    [pageCount - 3, pageCount - 2, pageCount - 1].forEach((n) => shown.add(n));
  const sorted = [...shown].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const result: (number | null)[] = [];
  for (const n of sorted) {
    const previous = result[result.length - 1];
    if (typeof previous === "number" && n - previous > 1)
      result.push(n - previous === 2 ? n - 1 : null);
    result.push(n);
  }
  return result;
}
