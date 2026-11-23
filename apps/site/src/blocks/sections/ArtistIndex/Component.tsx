import Link from 'next/link'
import React from 'react'

import { ArtistFilter, type ArtistTile } from '@/components/RadioLive/ArtistFilter'
import type { IndexedArtist } from '@/lib/radiolive/artist-index'
import type { ListItem } from '@/lib/section-data/shape'

import { SectionBand } from '../SectionBand'
import { SectionImage } from '../parts'
import type { SectionData, SectionProps } from '../types'

export type ArtistIndexData = SectionData

export interface ArtistIndexEntry {
  artist: IndexedArtist
  /** The artist's picture and address, shaped for a List entry (a deleted picture is left out). */
  item: ListItem | null
}

/** The band and the filter over artists already read. Draws nothing without one. The tiles are drawn here, on the server; the filter only hides the ones that do not match. */
export function ArtistIndexView({ block, entries }: { block: ArtistIndexData; entries: readonly ArtistIndexEntry[] }) {
  if (entries.length === 0) return null
  const tiles: ArtistTile[] = entries.map(({ artist, item }) => ({
    slug: artist.slug,
    name: artist.name,
    letter: artist.letter,
    haystack: artist.haystack,
    node: (
      <div className="relative flex h-full flex-col overflow-hidden rounded-lg border [background-color:var(--tone-card)] [border-color:var(--tone-card-rule)]">
        {item?.image && (
          <div className="aspect-square overflow-hidden">
            <SectionImage className="size-full" image={item.image} imgClassName="size-full object-cover" />
          </div>
        )}
        <div className="flex flex-col gap-1 p-4">
          <h3 className="font-serif text-lg font-bold leading-snug">
            <Link className="after:absolute after:inset-0 hover:underline" href={`/radiolive/artists/${artist.slug}`}>
              {artist.name}
            </Link>
          </h3>
          {artist.line && <p className="text-xs font-semibold [color:var(--tone-muted)]">{artist.line}</p>}
        </div>
      </div>
    ),
  }))
  return (
    <SectionBand block={block} heading={block.heading}>
      <ArtistFilter tiles={tiles} />
    </SectionBand>
  )
}

/** Artist index. Reads the published shows and draws nothing when there is none, or when the read fails (the rest of the page is still drawn). */
export async function ArtistIndexSection({ block }: SectionProps<ArtistIndexData>) {
  const { loadArtistIndex } = await import('@/lib/radiolive/artist-index-load')
  const entries = await loadArtistIndex().catch((error: unknown) => {
    console.error('The artist index could not be loaded and is left out.', error)
    return []
  })
  return <ArtistIndexView block={block} entries={entries} />
}
