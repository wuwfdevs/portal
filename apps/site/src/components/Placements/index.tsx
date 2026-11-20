import Link from 'next/link'
import React from 'react'

import type { Media as MediaDoc } from '@/payload-types'

import { Media } from '@/components/Media'
import type { FootItem } from '@/lib/placements/flow'
import { fillsFrame } from '@/lib/placements/media'
import { ZONES, type ZoneId } from '@/lib/placements/registry'
import type { PlacementTile } from '@/lib/placements/tiles'
import { cn } from '@/utilities/ui'

type Tile = PlacementTile<MediaDoc>

// The inset outline keeps a focus ring inside the card, whose rounded edge would otherwise clip it.
const linkClass = 'block outline-offset-[-4px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-wuwf-blue-700 hover:no-underline'

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

const RAIL_SHAPE = ZONES['home.rail'].artwork
const BAND_SHAPE = ZONES['home.band'].artwork
const PHONE_SHAPE = ZONES['home.band'].phoneArtwork ?? BAND_SHAPE

/**
 * A picture in a frame of a fixed shape. The picture is always shown whole and uncropped (sponsors' artwork carries their words). When it does not fill
 * the frame, the rest is a heavily blurred copy of the same picture, so the artwork sits on a wash of its own colors and never floats in a white box.
 * The copy is decorative (hidden from screen readers), the same file the picture already loads, and nothing here runs a script or asks anyone else's
 * server for anything. A picture that fills the frame draws no copy.
 */
function Art({ image, shape, size, className }: { image: MediaDoc; shape: { width: number; height: number }; size: string; className?: string }) {
  return (
    <span className={cn('relative block overflow-hidden bg-surface-2', className)} style={{ aspectRatio: `${shape.width} / ${shape.height}` }}>
      {!fillsFrame(image, shape) && (
        <span aria-hidden="true" className="absolute inset-0 block overflow-hidden">
          <Media fill imgClassName="scale-125 object-cover blur-2xl" pictureClassName="contents" resource={image} size="96px" />
        </span>
      )}
      <Media fill imgClassName="object-contain" pictureClassName="contents" resource={image} size={size} />
    </span>
  )
}

/** The strip above the artwork, in the site's own type: "Sponsor message" (or "From WUWF") and the sponsor's name. It is the page's label, never part of the picture. */
function Strip({ tile }: { tile: Tile }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-rule px-3.5 py-2">
      <p className={cn('shrink-0 font-sans text-xs font-bold uppercase tracking-widest', tile.kind === 'house' ? 'text-wuwf-blue-700' : 'text-ink-3')}>{tile.label}</p>
      {tile.sponsor && <p className="min-w-0 truncate font-sans text-sm font-semibold text-ink-2">{tile.sponsor}</p>}
    </div>
  )
}

/** One tile: the label strip, then the artwork as the link. Every tile is the same card and the same shape (the zone's recommended 5:4), so the column has one rhythm. */
function TileCard({ tile, size }: { tile: Tile; size: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-rule bg-surface">
      <Strip tile={tile} />
      <TileLink tile={tile}>
        <Art image={tile.image} shape={RAIL_SHAPE} size={size} />
      </TileLink>
    </div>
  )
}

const RAIL_SIZE = '(min-width: 1024px) 22rem, (min-width: 640px) 50vw, 100vw'

/**
 * A run of tiles in a zone: one under another on a phone, two across on a tablet, one column beside the page on a wide screen. Each tile is a card of
 * the same shape (`TileCard`). With no tiles it draws nothing, so no empty box is left.
 */
export function Rail({ zone, tiles, className }: { zone: ZoneId; tiles: readonly Tile[]; className?: string }) {
  if (tiles.length === 0) return null
  return (
    <aside aria-label="Sponsors and promotions" className={className} data-placement={zone}>
      <ul className="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-1">
        {tiles.map((tile) => (
          <li data-placement={tile.key} key={tile.key}>
            <TileCard size={RAIL_SIZE} tile={tile} />
          </li>
        ))}
      </ul>
    </aside>
  )
}

/** The pair of tiles beside one of the home page's news sections (`lib/placements/flow.ts`). A pair always fills its place at every width. */
export const HomePair = ({ tiles }: { tiles: readonly Tile[] }) => <Rail tiles={tiles} zone="home.rail" />

/** The rail beside the stories on a section, topic, reporter or all-stories page (`list.rail`): the placements aimed at that page. */
export const ListRail = ({ tiles }: { tiles: readonly Tile[] }) => <Rail tiles={tiles} zone="list.rail" />

/**
 * "More from our sponsors": every home page tile the news sections did not take, so a paid tile is never held back. Four across on a wide screen, two on a
 * tablet, one on a phone. Rows stay whole: a WUWF promotion that editors marked as able to fill a gap completes the last row where it is short, and with none
 * the last row's tiles are centered at the same size. A filler carries the narrowest screen it is needed on (`FootItem.from`); the page is cached for every
 * reader, so a breakpoint class shows or hides it.
 */
export function HomeFoot({ items }: { items: readonly FootItem<Tile>[] }) {
  if (items.length === 0) return null
  return (
    <aside aria-labelledby="more-sponsors-heading" className="container mt-16" data-placement="home.rail.more">
      <h2 className="border-b-2 border-ink pb-2 font-serif text-2xl font-bold text-ink" id="more-sponsors-heading">
        More from our sponsors
      </h2>
      <ul className="mt-5 flex flex-wrap justify-center gap-5">
        {items.map(({ tile, from }) => (
          <li
            className={cn('w-full sm:w-[calc((100%-1.25rem)/2)] lg:w-[calc((100%-3.75rem)/4)]', from === 'sm' && 'hidden sm:block', from === 'lg' && 'hidden lg:block')}
            data-placement={tile.key}
            key={tile.key}
          >
            <TileCard size="(min-width: 1024px) 18rem, (min-width: 640px) 50vw, 100vw" tile={tile} />
          </li>
        ))}
      </ul>
    </aside>
  )
}

/**
 * The home page banner (`home.band`): one message in a slim band between the news and the podcasts. It is never above the news and never
 * more than a sixth as tall as it is wide. A phone gets its own picture when the sponsor supplied one, else the wide picture scaled down.
 */
export function HomeBand({ tile }: { tile: Tile | null }) {
  if (!tile) return null
  const phone = tile.phoneImage
  return (
    <aside aria-label="Sponsor banner" className="container mt-16" data-placement={tile.key}>
      <div className="overflow-hidden rounded-lg border border-rule bg-surface">
        <Strip tile={tile} />
        <TileLink tile={tile}>
          <Art className={cn(phone && 'hidden md:block')} image={tile.image} shape={BAND_SHAPE} size="(min-width: 1280px) 1200px, 100vw" />
          {phone && <Art className="md:hidden" image={phone} shape={PHONE_SHAPE} size="100vw" />}
        </TileLink>
      </div>
    </aside>
  )
}
