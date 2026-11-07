import type { Metadata } from 'next/types'

import configPromise from '@payload-config'
import Link from 'next/link'
import { getPayload } from 'payload'
import React from 'react'

import { formatLongDate } from '@/lib/format'
import {
  KIND_LABELS,
  MAX_QUERY_LENGTH,
  SEARCH_FILTERS,
  SEARCH_PAGE_SIZE,
  countLine,
  isSearchKind,
  parseSearchParams,
  searchHref,
  searchWhere,
} from '@/lib/search/query'

type Args = { searchParams: Promise<Record<string, string | string[] | undefined>> }

const pill = 'inline-flex min-h-11 items-center rounded-pill border px-5 text-base font-bold'

/**
 * Search (board 27). A page, not a popup, so a search can be linked and filtered: `?q=…&type=stories|shows|video`.
 * It reads the search index the plugin keeps in sync with stories, shows and short video; drafts never reach it.
 * The form is a plain GET form, so it works before any JavaScript.
 */
export default async function SearchPage({ searchParams }: Args) {
  const request = parseSearchParams(await searchParams)
  const where = searchWhere(request)

  let results: { docs: SearchHit[]; totalDocs: number; totalPages: number } | null = null
  let failed = false
  if (where) {
    try {
      const payload = await getPayload({ config: configPromise })
      const found = await payload.find({
        collection: 'search',
        overrideAccess: false,
        depth: 0,
        limit: SEARCH_PAGE_SIZE,
        page: request.page,
        // Shows and programs have no date and come first, so a search for a show's name leads with the show.
        sort: ['-publishedAt', '-priority'],
        select: { title: true, path: true, kind: true, publishedAt: true, meta: true },
        where,
      })
      results = { docs: found.docs as SearchHit[], totalDocs: found.totalDocs, totalPages: found.totalPages }
    } catch (error) {
      failed = true
      console.error('Search failed', error)
    }
  }

  return (
    <div className="container flex flex-col gap-6 py-12">
      <h1 className="font-serif text-4xl font-bold leading-tight text-ink md:text-6xl">Search</h1>

      <form action="/search" className="flex max-w-3xl flex-wrap gap-3" method="get" role="search">
        <label className="sr-only" htmlFor="q">
          Search wuwf.org
        </label>
        <input
          className="min-h-13 min-w-0 flex-1 basis-80 rounded-sm border border-rule-strong bg-surface px-4 text-lg text-ink"
          defaultValue={request.q}
          id="q"
          maxLength={MAX_QUERY_LENGTH}
          name="q"
          placeholder="Search stories, shows and video"
          type="search"
        />
        {request.type !== 'all' && <input name="type" type="hidden" value={request.type} />}
        <button className="min-h-13 rounded-sm bg-wuwf-blue-700 px-7 text-base font-bold text-surface hover:bg-wuwf-blue-600" type="submit">
          Search
        </button>
      </form>

      {request.q && (
        <nav aria-label="Narrow results" className="flex flex-wrap gap-2">
          {SEARCH_FILTERS.map((filter) => {
            const on = filter.value === request.type
            return (
              <Link
                aria-current={on ? 'page' : undefined}
                className={`${pill} ${on ? 'border-ink bg-ink text-surface hover:no-underline' : 'border-rule-strong bg-surface text-ink'}`}
                href={searchHref({ q: request.q, type: filter.value })}
                key={filter.value}
              >
                {filter.label}
              </Link>
            )
          })}
        </nav>
      )}

      {failed && (
        <p className="rounded-sm border border-rule bg-surface-2 p-4 text-base text-ink" role="alert">
          Search is not working right now. Please try again in a minute.
        </p>
      )}

      {results && (
        <>
          <p aria-live="polite" className="text-sm text-ink-3">
            {countLine(results.totalDocs, request.q)}
          </p>

          {results.totalDocs === 0 ? (
            <section aria-label="When nothing matches" className="flex flex-col gap-2 rounded-sm bg-surface-2 p-6">
              <h2 className="font-serif text-2xl font-bold text-ink">Nothing matched “{request.q}”.</h2>
              <p className="max-w-2xl text-base text-ink-2">
                Check the spelling, try fewer words, or start from a section: <Link href="/">News</Link>,{' '}
                <Link href="/podcasts">Podcasts</Link>, <Link href="/video">Video</Link>.
              </p>
            </section>
          ) : (
            <ol className="flex max-w-3xl flex-col">
              {results.docs.map((hit) => (
                <Result hit={hit} key={hit.id} />
              ))}
            </ol>
          )}

          {results.totalPages > 1 && (
            <nav aria-label="More results" className="flex gap-4">
              {request.page > 1 && (
                <Link className="inline-flex min-h-11 items-center font-bold" href={searchHref({ ...request, page: request.page - 1 })}>
                  Previous page
                </Link>
              )}
              {request.page < results.totalPages && (
                <Link className="inline-flex min-h-11 items-center font-bold" href={searchHref({ ...request, page: request.page + 1 })}>
                  Next page
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  )
}

type SearchHit = {
  id: number | string
  title?: string | null
  path?: string | null
  kind?: string | null
  publishedAt?: string | null
  meta?: { title?: string | null; description?: string | null } | null
}

function Result({ hit }: { hit: SearchHit }) {
  const title = hit.meta?.title || hit.title
  if (!hit.path || !title) return null
  const label = isSearchKind(hit.kind) ? KIND_LABELS[hit.kind] : 'Story'
  const when = hit.publishedAt ? formatLongDate(hit.publishedAt) : ''
  return (
    <li className="flex flex-col gap-1.5 border-t border-rule py-5">
      <span className="text-xs font-bold uppercase tracking-widest text-ink-3">
        {label}
        {when && ` · ${when}`}
      </span>
      <Link className="font-serif text-2xl font-bold leading-snug text-ink" href={hit.path}>
        {title}
      </Link>
      {hit.meta?.description && <p className="text-base text-ink-2">{hit.meta.description}</p>}
    </li>
  )
}

export async function generateMetadata({ searchParams }: Args): Promise<Metadata> {
  const { q } = parseSearchParams(await searchParams)
  // A results page is not content: it is linkable, but search engines should not index it.
  return { title: q ? `Search: ${q}` : 'Search', robots: { index: false, follow: true } }
}
