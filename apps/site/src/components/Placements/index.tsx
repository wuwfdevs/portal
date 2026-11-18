import Link from 'next/link'
import React from 'react'

import type { Media as MediaDoc } from '@/payload-types'

import { Media } from '@/components/Media'
import { PLACEMENTS } from '@/lib/placements/registry'
import type { PlacementTile } from '@/lib/placements/tiles'
import { cn } from '@/utilities/ui'

type Tile = PlacementTile<MediaDoc>

const linkClass = 'block rounded-sm outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-wuwf-blue-700 hover:no-underline'

/** One tile's link, to a page on this site (client navigation, so audio keeps playing) or out to a sponsor (marked sponsored, no referrer). */
function TileLink({ tile, className, children }: { tile: Tile; className?: string; children: React.ReactNode }) {
  return tile.href.startsWith('/') ? (
    <Link aria-label={tile.name} className={cn(linkClass, className)} href={tile.href} rel={tile.rel}>
      {children}
    </Link>
  ) : (
    <a aria-label={tile.name} className={cn(linkClass, className)} href={tile.href} rel={tile.rel}>
      {children}
    </a>
  )
}

/** "Sponsor message", set apart from the picture so it is read as the page's own label and never as part of the artwork. */
const Label = ({ children }: { children: React.ReactNode }) => <p className="mb-1.5 font-sans text-xs font-bold uppercase tracking-widest text-ink-3">{children}</p>

const RAIL_SHAPE = PLACEMENTS['home.rail'].artwork
const BAND_SHAPE = PLACEMENTS['home.band'].artwork
const PHONE_SHAPE = PLACEMENTS['home.band'].phoneArtwork ?? BAND_SHAPE

/**
 * The home page rail (`home.rail`): up to ten tiles in a column beside the news, one under another on a phone. Every tile has the same shape
 * (the picture is fitted inside it, never cropped, because sponsors' artwork carries their words). Nothing here loads a script or an outside
 * request: a tile is a picture and a link.
 */
export function HomeRail({ tiles }: { tiles: readonly Tile[] }) {
  if (tiles.length === 0) return null
  return (
    <aside aria-label="Sponsors and promotions" data-placement="home.rail">
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
        {tiles.map((tile) => (
          <li data-placement={tile.key} key={tile.key}>
            {tile.label && <Label>{tile.label}</Label>}
            <TileLink tile={tile}>
              <span className="relative block overflow-hidden rounded-sm border border-rule bg-surface-2" style={{ aspectRatio: `${RAIL_SHAPE.width} / ${RAIL_SHAPE.height}` }}>
                <Media fill imgClassName="object-contain" pictureClassName="contents" resource={tile.image} size="(min-width: 1024px) 22rem, (min-width: 640px) 50vw, 100vw" />
              </span>
            </TileLink>
          </li>
        ))}
      </ul>
    </aside>
  )
}

/**
 * The home page banner (`home.band`): one message in a slim band between the news and the video row. It is never above the news and never
 * more than a sixth as tall as it is wide. A phone gets its own picture when the sponsor supplied one, else the wide picture scaled down.
 */
export function HomeBand({ tile }: { tile: Tile | null }) {
  if (!tile) return null
  const phone = tile.phoneImage
  return (
    <aside aria-label="Sponsor banner" className="container mt-16" data-placement={tile.key}>
      {tile.label && <Label>{tile.label}</Label>}
      <TileLink tile={tile}>
        <span className={cn('relative block overflow-hidden rounded-sm border border-rule bg-surface-2', phone && 'hidden md:block')} style={{ aspectRatio: `${BAND_SHAPE.width} / ${BAND_SHAPE.height}` }}>
          <Media fill imgClassName="object-contain" pictureClassName="contents" resource={tile.image} size="(min-width: 1280px) 1200px, 100vw" />
        </span>
        {phone && (
          <span className="relative block overflow-hidden rounded-sm border border-rule bg-surface-2 md:hidden" style={{ aspectRatio: `${PHONE_SHAPE.width} / ${PHONE_SHAPE.height}` }}>
            <Media fill imgClassName="object-contain" pictureClassName="contents" resource={phone} size="100vw" />
          </span>
        )}
      </TileLink>
    </aside>
  )
}
