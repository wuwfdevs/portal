'use client'

import React, { useId, useMemo, useState } from 'react'

import { filterArtists, lettersPresent } from '@/lib/radiolive/artist-index'

/** One artist: what the filter needs, and the tile the server already drew for them. */
export interface ArtistTile {
  slug: string
  name: string
  letter: string
  haystack: string
  node: React.ReactNode
}

const chip = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill border px-3 text-sm font-bold [border-color:var(--tone-card-rule)]'

/**
 * The search and the A to Z over the artists' tiles. The full list is on the page when it loads (the server drew it), so it reads and its links work without script; with
 * script the search words and a letter narrow it, and the count says how many are shown. A tile that does not match is hidden, not removed, so a screen reader hears the change in the count.
 */
export function ArtistFilter({ tiles }: { tiles: readonly ArtistTile[] }) {
  const [query, setQuery] = useState('')
  const [letter, setLetter] = useState<string | null>(null)
  const id = useId()
  const letters = useMemo(() => lettersPresent(tiles), [tiles])
  const shown = useMemo(() => new Set(filterArtists(tiles, query, letter).map((t) => t.slug)), [tiles, query, letter])
  const narrowed = query.trim() !== '' || letter !== null
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex max-w-xl flex-col gap-1">
          <label className="text-sm font-bold" htmlFor={`${id}-q`}>
            Search artists by name
          </label>
          {/* 16px: a smaller field zooms the page on a phone. */}
          <input
            autoComplete="off"
            className="min-h-11 rounded-lg border px-3 text-base [background-color:var(--tone-card)] [border-color:var(--tone-card-rule)] [color:var(--tone-text)]"
            id={`${id}-q`}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            value={query}
          />
        </div>
        <div aria-label="Artists by first letter" className="flex flex-wrap gap-2" role="group">
          <button aria-pressed={letter === null} className={`${chip} ${letter === null ? '[background-color:var(--tone-button)] [color:var(--tone-button-text)]' : ''}`} onClick={() => setLetter(null)} type="button">
            All
          </button>
          {letters.map((l) => (
            <button
              aria-label={l === '#' ? 'Names that start with a number' : `Names that start with ${l}`}
              aria-pressed={letter === l}
              className={`${chip} ${letter === l ? '[background-color:var(--tone-button)] [color:var(--tone-button-text)]' : ''}`}
              key={l}
              onClick={() => setLetter(l === letter ? null : l)}
              type="button"
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <p aria-live="polite" className="text-sm [color:var(--tone-muted)]" role="status">
        {narrowed ? `${shown.size} of ${tiles.length} artists` : `${tiles.length} ${tiles.length === 1 ? 'artist' : 'artists'}`}
        {narrowed && (
          <>
            {' · '}
            <button
              className="font-bold underline"
              onClick={() => {
                setQuery('')
                setLetter(null)
              }}
              type="button"
            >
              Show everyone
            </button>
          </>
        )}
      </p>
      {shown.size === 0 && <p className="text-lg">No artist matches. Try fewer letters, or choose All.</p>}
      <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 sm:gap-6 lg:grid-cols-5">
        {tiles.map((t) => (
          <li className="min-w-0" hidden={!shown.has(t.slug)} key={t.slug}>
            {t.node}
          </li>
        ))}
      </ul>
    </div>
  )
}
