import Link from "next/link";
import { cn } from "@/lib/cn";
import { pageHref, pageNumbers, type PageInfo } from "@/lib/pagination";

/**
 * The footer under a paginated list: "26–50 of 132" and page links. Plain
 * links carrying the list's other query parameters, so it works with no
 * client JavaScript, like FilterChips. Renders only the count when everything
 * fits on one page, and nothing for an empty list.
 */
export function Pagination({
  info,
  path,
  params,
  noun = "items",
  className,
}: {
  info: PageInfo;
  path: string;
  /** The list's other query parameters (search, filters) — kept on every link. */
  params: Record<string, string | null | undefined>;
  noun?: string;
  className?: string;
}) {
  if (info.total === 0) return null;
  const href = (page: number) => pageHref(path, params, page);
  const link =
    "inline-flex h-8 min-w-8 items-center justify-center rounded border px-2.5 text-[13px] font-semibold";

  return (
    <nav
      aria-label="Pages"
      className={cn("mt-4 flex flex-wrap items-center justify-between gap-3", className)}
    >
      <p className="text-xs text-ink-500">
        {info.first}–{info.last} of {info.total} {noun}
      </p>
      {info.pageCount > 1 && (
        <ul className="flex flex-wrap items-center gap-1.5">
          <li>
            {info.page > 1 ? (
              <Link
                href={href(info.page - 1)}
                rel="prev"
                className={cn(link, "border-line bg-white text-ink-700 hover:border-brand-primary")}
              >
                Previous
              </Link>
            ) : (
              <span aria-disabled="true" className={cn(link, "border-line text-ink-400")}>
                Previous
              </span>
            )}
          </li>
          {pageNumbers(info.page, info.pageCount).map((page, index) =>
            page === null ? (
              <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-xs text-ink-400">
                …
              </li>
            ) : (
              <li key={page}>
                <Link
                  href={href(page)}
                  aria-label={`Page ${page}`}
                  aria-current={page === info.page ? "page" : undefined}
                  className={cn(
                    link,
                    page === info.page
                      ? "border-brand-surface bg-brand-surface text-brand-link"
                      : "border-line bg-white text-ink-700 hover:border-brand-primary",
                  )}
                >
                  {page}
                </Link>
              </li>
            ),
          )}
          <li>
            {info.page < info.pageCount ? (
              <Link
                href={href(info.page + 1)}
                rel="next"
                className={cn(link, "border-line bg-white text-ink-700 hover:border-brand-primary")}
              >
                Next
              </Link>
            ) : (
              <span aria-disabled="true" className={cn(link, "border-line text-ink-400")}>
                Next
              </span>
            )}
          </li>
        </ul>
      )}
    </nav>
  );
}
