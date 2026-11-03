'use client'

import Link from 'next/link'
import React, { useMemo, useState } from 'react'

import { episodeCount } from '@/lib/unearthing/group'
import { ERAS, eraLabel, type Era } from '@/lib/unearthing/periods'

export interface PanelSite {
  id: string | number
  name: string
  short: string
  place: string
  era: Era
  description: string | null
  x: number
  y: number
  count: number
  episodes: { id: string | number; title: string; path: string | null }[]
}
export interface PanelPeriod {
  value: string
  label: string
  when: string
  era: Era
  count: number
}

const pill = 'inline-flex min-h-11 items-center rounded-full border px-4 font-sans text-sm font-bold'

/**
 * The hub's map, era filter and timeline (board 11). The era filter dims the pins and timeline rows outside the chosen era; it
 * never hides them, so nothing becomes unreachable. Every pin is a real button with a name, and the chosen site's details sit
 * in a labelled panel beside the map, so the map works with a keyboard and a screen reader.
 */
export function ExplorePanel({ sites, periods }: { sites: PanelSite[]; periods: PanelPeriod[] }) {
  const [era, setEra] = useState<Era | 'all'>('all')
  const [chosen, setChosen] = useState<string | number | null>(sites[0]?.id ?? null)
  const site = useMemo(() => sites.find((s) => String(s.id) === String(chosen)) ?? null, [sites, chosen])
  const inEra = (e: Era) => era === 'all' || era === e

  return (
    <div className="flex flex-col gap-8">
      <div aria-label="Filter by era" className="flex flex-wrap gap-2" role="group">
        {[{ value: 'all' as const, label: 'All' }, ...ERAS].map((e) => {
          const on = era === e.value
          return (
            <button
              aria-pressed={on}
              className={`${pill} ${on ? 'border-warning-fg bg-warning-fg text-surface' : 'border-warning-border bg-surface text-ink hover:bg-warning-bg'}`}
              key={e.value}
              onClick={() => setEra(e.value)}
              type="button"
            >
              {e.label}
            </button>
          )
        })}
      </div>

      {sites.length === 0 ? (
        <p className="rounded-sm border border-dashed border-warning-border p-6 text-ink-2">The map fills in as sites are added.</p>
      ) : (
        <div className="flex flex-wrap gap-8">
          <div className="relative aspect-[4/3] min-w-0 flex-[999_1_34rem] overflow-hidden rounded-sm border border-warning-border bg-warning-bg">
            <svg aria-label="Schematic map of Florida with episode locations" className="absolute inset-0 block h-full w-full" role="img" viewBox="0 0 400 300">
              <path d="M18 40 L230 40 L252 46 L300 46 L318 70 L336 120 L356 200 L366 252 L346 290 L326 282 L312 250 L298 226 L286 186 L280 152 L262 116 L244 96 L214 86 L176 82 L136 80 L96 76 L58 70 L18 62 Z" fill="#F6E3BC" stroke="#8A5A12" strokeWidth="1.5" />
              <text fill="#8A5A12" fontSize="10" x="24" y="30">Schematic · not to scale</text>
            </svg>
            {sites.map((s) => {
              const on = String(chosen) === String(s.id)
              return (
                <button
                  aria-label={s.name}
                  aria-pressed={on}
                  className={`absolute flex min-h-11 items-center gap-1.5 bg-transparent pr-2 font-sans transition-opacity ${inEra(s.era) ? 'opacity-100' : 'opacity-30'}`}
                  key={s.id}
                  onClick={() => setChosen(s.id)}
                  style={{ left: `${s.x}%`, top: `${s.y}%`, transform: 'translate(-8px, -50%)' }}
                  type="button"
                >
                  <span aria-hidden="true" className={`h-4 w-4 shrink-0 rounded-full border-2 border-surface ring-1 ring-warning-fg ${on ? 'bg-ink' : 'bg-warning-fg'}`} />
                  <span aria-hidden="true" className="rounded-sm bg-surface/85 px-1.5 text-xs font-bold text-ink">{s.short}</span>
                </button>
              )
            })}
          </div>

          <aside aria-live="polite" className="flex min-w-0 flex-[1_1_20rem] flex-col gap-3 rounded-sm bg-warning-bg p-6">
            {site ? (
              <>
                <p className="font-mono text-xs text-warning-fg">{eraLabel(site.era)} · {site.place}</p>
                <h3 className="font-serif text-2xl font-bold leading-tight text-ink">{site.name}</h3>
                {site.description && <p className="text-base text-ink-2">{site.description}</p>}
                <p className="text-sm font-bold text-ink">{episodeCount(site.count)}</p>
                {site.episodes.length > 0 && (
                  <ul className="flex flex-col">
                    {site.episodes.slice(0, 6).map((e) => (
                      <li className="border-t border-warning-border/60 py-2" key={e.id}>
                        {e.path ? (
                          <Link className="min-h-11 font-semibold text-ink underline underline-offset-4" href={e.path}>{e.title}</Link>
                        ) : (
                          e.title
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-ink-2">Choose a place on the map.</p>
            )}
          </aside>
        </div>
      )}

      <ol aria-label="Timeline" className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] border-t-2 border-warning-fg p-0">
        {periods.map((p) => (
          <li className={`flex flex-col gap-1 pr-3 pt-3.5 transition-opacity ${inEra(p.era) ? 'opacity-100' : 'opacity-40'}`} key={p.value}>
            <span className="font-mono text-xs text-warning-fg">{p.when}</span>
            <strong className="text-[0.95rem] leading-snug text-ink">{p.label}</strong>
            <span className="text-xs text-ink-3">{episodeCount(p.count)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
