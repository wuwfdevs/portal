'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { episodeCountLine, inWindowNote, siteFeatures, sitesInView, type MapBounds } from '@/lib/explore/filter'
import type { ExploreSite } from '@/lib/explore/shape'
import { formatSpan, formatYear, scaleFor, type YearSpan } from '@/lib/explore/years'

import { WindowControl } from './WindowControl'

// MapLibre is a separate chunk, fetched when the panel is on a page and not before; the list and the window need no map and are drawn without it.
const ExploreMap = dynamic(() => import('./ExploreMap'), {
  ssr: false,
  loading: () => <div className="flex aspect-[4/3] max-h-[34rem] min-h-[20rem] w-full items-center justify-center text-sm [color:var(--tone-muted)]">Loading the map…</div>,
})

const PAGE = 20

/**
 * Explore: one object, three views of the same sites. The map (clustered), the docked time window and the site list share the window, the search words and the selected site, so what the
 * map shows and what the list says never disagree. The window filters the sites AND each site's episodes ("2 of 9 episodes fall in 1513 – 1821"); the map's view filters the list
 * ("142 sites in view and in this window"). Nothing is drawn from a third party: the map has no basemap unless the station set one. The data is the page's show's published episodes and
 * their sites (`lib/explore/load`), already shaped; this component holds only the reader's choices.
 */
export function ExplorePanel({ sites, thisYear, styleUrl, label }: { sites: readonly ExploreSite[]; thisYear: number; styleUrl: string | null; label: string }) {
  const scale = useMemo(() => scaleFor(thisYear), [thisYear])
  const full = useMemo<YearSpan>(() => ({ from: scale[0]!.from, to: scale[scale.length - 1]!.to }), [scale])
  const [window, setWindow] = useState<YearSpan>(full)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [bounds, setBounds] = useState<MapBounds | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const atFull = window.from === full.from && window.to === full.to

  const spans = useMemo(() => sites.flatMap((s) => s.episodes.map((e) => e.span)), [sites])
  const onMap = useMemo(() => sitesInView(sites, window, query, null), [sites, window, query])
  const points = useMemo(() => siteFeatures(onMap), [onMap])
  const inView = useMemo(() => sitesInView(sites, window, query, bounds), [sites, window, query, bounds])
  const spanLabel = formatSpan(window.from, window.to)

  const selected = selectedId ? onMap.find((v) => v.site.id === selectedId) ?? null : null
  const selectedNote = selected ? inWindowNote(selected.inWindow.length, selected.site.episodes.length) : null

  // A selected site the window or the search has since removed is not shown as selected (`selected` is null for it); it is selected again if a wider window brings it back.

  const listRef = useRef<HTMLUListElement>(null)
  const selectedSiteId = selected?.site.id ?? null
  useEffect(() => {
    if (!selectedSiteId) return
    listRef.current?.querySelector(`[data-site="${CSS.escape(selectedSiteId)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedSiteId])

  const onView = useCallback((b: MapBounds) => setBounds(b), [])
  const shown = inView.slice(0, limit)
  const total = sites.length

  return (
    <div className="flex flex-wrap items-stretch overflow-hidden rounded-4 border [background-color:var(--tone-card)] [border-color:var(--tone-card-rule)]">
      <div className="min-w-0 flex-[999_1_35rem] lg:max-w-[47.5rem]">
        <ExploreMap label={label} onSelect={setSelectedId} onView={onView} points={points} selectedId={selected?.site.id ?? null} selectedNote={selectedNote} styleUrl={styleUrl} />
        <WindowControl atFull={atFull} onChange={setWindow} onReset={() => setWindow(full)} spans={spans} thisYear={thisYear} value={window} />
      </div>
      <div className="flex min-w-0 flex-[1_1_20rem] flex-col border-t lg:border-l lg:border-t-0 [border-color:var(--tone-card-rule)]">
        <div className="flex flex-col gap-1 border-b p-4 [border-color:var(--tone-card-rule)]">
          <label className="text-sm font-bold" htmlFor="explore-search">
            Search sites
          </label>
          <input
            autoComplete="off"
            className="min-h-11 w-full rounded-lg border px-3 text-base [background-color:var(--tone-card)] [border-color:var(--tone-card-rule)]"
            id="explore-search"
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(PAGE)
            }}
            placeholder="A mission, a fort, a place"
            type="search"
            value={query}
          />
          <p aria-live="polite" className="pt-1 text-sm [color:var(--tone-muted)]" role="status">
            {total === 0 ? 'No sites yet.' : `${inView.length} ${inView.length === 1 ? 'site' : 'sites'} in view and in this window`}
          </p>
        </div>
        {inView.length === 0 && total > 0 && (
          <p className="p-4 text-sm [color:var(--tone-muted)]">
            No site matches. {query ? 'Try other words, ' : ''}widen the window or zoom the map out.
          </p>
        )}
        <ul className="m-0 max-h-[30rem] list-none overflow-y-auto p-0 lg:max-h-[32rem]" ref={listRef}>
          {shown.map(({ site, inWindow }) => {
            const isSelected = site.id === selected?.site.id
            return (
              <li className="border-b last:border-b-0 [border-color:var(--tone-card-rule)]" data-site={site.id} key={site.id}>
                <button
                  aria-expanded={isSelected}
                  className="flex min-h-11 w-full flex-col gap-0.5 px-4 py-3 text-left hover:[background-color:var(--tone-tint)] aria-expanded:[background-color:var(--tone-tint)]"
                  onClick={() => setSelectedId(isSelected ? null : site.id)}
                  type="button"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-serif text-lg font-bold leading-snug">{site.name}</span>
                    <span className="shrink-0 text-sm font-semibold [color:var(--tone-muted)]">
                      {inWindow.length === site.episodes.length ? `${site.episodes.length} ${site.episodes.length === 1 ? 'episode' : 'episodes'}` : `${inWindow.length} of ${site.episodes.length} episodes`}
                    </span>
                  </span>
                  <span className="text-sm [color:var(--tone-muted)]">
                    {[site.place, site.era].filter(Boolean).join(' · ')}
                    {site.lat === null && ' · Location not set'}
                  </span>
                </button>
                {isSelected && (
                  <div className="flex flex-col gap-2 px-4 pb-4 pt-1 text-sm">
                    {site.description && <p className="m-0">{site.description}</p>}
                    <p className="m-0 font-semibold">{episodeCountLine(inWindow.length, site.episodes.length, spanLabel)}{inWindow.length === site.episodes.length ? '' : '.'}</p>
                    <ul className="m-0 flex list-none flex-col p-0">
                      {inWindow.map((e) => (
                        <li className="flex items-baseline justify-between gap-3 border-t py-2 [border-color:var(--tone-card-rule)]" key={e.id}>
                          {e.href ? (
                            <Link className="font-semibold underline-offset-2 hover:underline [color:var(--tone-accent)]" href={e.href}>
                              {e.title}
                            </Link>
                          ) : (
                            <span className="font-semibold">{e.title}</span>
                          )}
                          {e.span && <span className="shrink-0 text-xs [color:var(--tone-muted)]">{formatYear(e.span.from)}</span>}
                        </li>
                      ))}
                    </ul>
                    {inWindow.length < site.episodes.length && (
                      <button className="inline-flex min-h-11 items-center self-start font-bold underline-offset-2 hover:underline [color:var(--tone-accent)]" onClick={() => setWindow(full)} type="button">
                        Show all {site.episodes.length}, any year →
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {inView.length > limit && (
          <button className="inline-flex min-h-11 items-center justify-center border-t px-4 text-sm font-bold underline-offset-2 hover:underline [border-color:var(--tone-card-rule)] [color:var(--tone-accent)]" onClick={() => setLimit((n) => n + PAGE)} type="button">
            Show {Math.min(PAGE, inView.length - limit)} more of {inView.length}
          </button>
        )}
      </div>
    </div>
  )
}
