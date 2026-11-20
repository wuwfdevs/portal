import Link from 'next/link'
import React from 'react'

import type { Media as MediaDoc } from '@/payload-types'

import { Media } from '@/components/Media'
import type { RowItem } from '@/lib/placements/flow'
import { fillsFrame } from '@/lib/placements/media'
import { TOP_UNIT_ARTWORK, TOP_UNIT_PHONE_ARTWORK, ZONES, type ZoneId } from '@/lib/placements/registry'
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
 * A run of tiles in a zone (the list pages' rail): one under another on a phone, two across on a tablet, one column beside the page on a wide screen. Each tile is a card of
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

/** The rail beside the stories on a section, topic, reporter or all-stories page (`list.rail`): the placements aimed at that page. */
export const ListRail = ({ tiles }: { tiles: readonly Tile[] }) => <Rail tiles={tiles} zone="list.rail" />

/**
 * A row of the home page's tiles, full width between news sections (`lib/placements/flow.ts`). Tiles are a fixed 22rem wide and wrap, centered, so three
 * fill a wide screen's row, two and one sit on a tablet, and a phone gets a stack, with no blank gutter and no row left half empty at any width. A short
 * last row (or one completed by WUWF's own promotions) is centered, so it looks deliberate. Draws nothing with no tiles.
 */
export function SponsorRow({ items }: { items: readonly RowItem<Tile>[] }) {
  if (items.length === 0) return null
  return (
    <aside aria-label="Sponsors and promotions" data-placement="home.rail">
      <ul className="flex flex-wrap justify-center gap-6">
        {items.map(({ tile }) => (
          <li className="w-[22rem] max-w-full" data-placement={tile.key} key={tile.key}>
            <TileCard size="22rem" tile={tile} />
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

/**
 * A top unit (`home.top`, `list.top`): one labeled message in a slim strip the width of the page's content (`TOP_UNIT_ARTWORK`), directly under the header and the banner. It is one
 * picture and one link, never a script and never motion, and the caller holds it back while an emergency banner is on (`lib/placements/exclusions.ts`).
 * A phone gets its own picture when the sponsor supplied one, else the wide picture scaled down. Draws nothing with no tile, so no empty box is left.
 */
export function TopUnit({ tile, className }: { tile: Tile | null; className?: string }) {
  if (!tile) return null
  const phone = tile.phoneImage
  return (
    <aside aria-label={tile.label} className={cn('w-full', className)} data-placement={tile.key}>
      <div className="overflow-hidden rounded-lg border border-rule bg-surface">
        <Strip tile={tile} />
        <TileLink tile={tile}>
          <Art className={cn(phone && 'hidden md:block')} image={tile.image} shape={TOP_UNIT_ARTWORK} size="(min-width: 1280px) 1200px, 100vw" />
          {phone && <Art className="md:hidden" image={phone} shape={TOP_UNIT_PHONE_ARTWORK} size="100vw" />}
        </TileLink>
      </div>
    </aside>
  )
}

/**
 * The story page's rail (`story.rail`): the tiles beside the story text on a wide screen, after the story on a phone. The same labeled card as every other tile.
 * `Rail` already stacks them one under another in a column (two across on a tablet), so this is that with the zone named.
 */
export const StoryRail = ({ tiles, className }: { tiles: readonly Tile[]; className?: string }) => <Rail className={className} tiles={tiles} zone="story.rail" />

/**
 * The band inside a story (`story.inline`), after its opening paragraphs: one labeled message in the band shape, in the story's own column, set apart from the text
 * with space above and below. One picture and one link; never a script, never motion. Draws nothing without a tile.
 */
export function InlineUnit({ tile }: { tile: Tile | null }) {
  if (!tile) return null
  const phone = tile.phoneImage
  return (
    <aside aria-label={tile.label} className="not-prose my-10" data-placement={tile.key}>
      <div className="overflow-hidden rounded-lg border border-rule bg-surface">
        <Strip tile={tile} />
        <TileLink tile={tile}>
          <Art className={cn(phone && 'hidden md:block')} image={tile.image} shape={BAND_SHAPE} size="(min-width: 768px) 760px, 100vw" />
          {phone && <Art className="md:hidden" image={phone} shape={PHONE_SHAPE} size="100vw" />}
        </TileLink>
      </div>
    </aside>
  )
}
