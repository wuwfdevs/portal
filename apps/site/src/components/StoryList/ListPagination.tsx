import Link from 'next/link'
import React from 'react'

import { listHref, type ListKind } from '@/lib/lists/route'

const base = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm border px-4 text-base font-semibold'

/**
 * Previous, next and numbered page links. Plain links, so they work without a script, and each is at least 44px.
 * The page you are on is marked as the current page for screen readers.
 */
export function ListPagination({ kind, slug, page, totalPages }: { kind: ListKind; slug: string; page: number; totalPages: number }) {
  if (totalPages <= 1) return null
  // The first page, the last, and a window around the current one; gaps are marked.
  const wanted = new Set([1, totalPages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= totalPages))
  const numbers = [...wanted].sort((a, b) => a - b)
  return (
    <nav aria-label="Pagination" className="mt-12 flex flex-wrap items-center gap-2 font-sans">
      {page > 1 && (
        <Link className={`${base} border-rule-strong text-wuwf-blue-700 hover:bg-surface-2 hover:no-underline`} href={listHref(kind, slug, page - 1)} rel="prev">
          Newer
        </Link>
      )}
      {numbers.map((n, i) => (
        <React.Fragment key={n}>
          {i > 0 && n - numbers[i - 1]! > 1 && <span aria-hidden="true" className="px-1 text-ink-3">…</span>}
          {n === page ? (
            <span aria-current="page" className={`${base} border-wuwf-blue-700 bg-wuwf-blue-700 text-surface`}>
              {n}
            </span>
          ) : (
            <Link aria-label={`Page ${n}`} className={`${base} border-rule-strong text-wuwf-blue-700 hover:bg-surface-2 hover:no-underline`} href={listHref(kind, slug, n)}>
              {n}
            </Link>
          )}
        </React.Fragment>
      ))}
      {page < totalPages && (
        <Link className={`${base} border-rule-strong text-wuwf-blue-700 hover:bg-surface-2 hover:no-underline`} href={listHref(kind, slug, page + 1)} rel="next">
          Older
        </Link>
      )}
    </nav>
  )
}
