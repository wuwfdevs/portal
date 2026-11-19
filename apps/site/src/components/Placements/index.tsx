import Link from 'next/link'
import React from 'react'

import type { Media as MediaDoc } from '@/payload-types'

import { Media } from '@/components/Media'
import { pictureShape } from '@/lib/placements/media'
import { ZONES, type ZoneId } from '@/lib/placements/registry'
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

const BAND_SHAPE = ZONES['home.band'].artwork
const PHONE_SHAPE = ZONES['home.band'].phoneArtwork ?? BAND_SHAPE

/**
 * A rail of tiles in a zone: one under another on a phone, two across on a tablet, one column beside the page on a wide screen. Each tile's box
 * takes its own picture's shape, so it is exactly as tall as the picture and the gaps between tiles are the same all the way down (the picture is
 * shown whole, never cropped, because sponsors' artwork carries their words). The zone's recommended shape is used only for a picture whose size is
 * not recorded. Nothing here loads a script or an outside request: a tile is a picture and a link. With no tiles it draws nothing, so no empty box is left.
 */
export function Rail({ zone, tiles, className }: { zone: ZoneId; tiles: readonly Tile[]; className?: string }) {
  if (tiles.length === 0) return null
  const fallback = ZONES[zone].artwork
  return (
    <aside aria-label="Sponsors and promotions" className={className} data-placement={zone}>
      <ul className="grid items-start gap-6 sm:grid-cols-2 lg:grid-cols-1">
        {tiles.map((tile) => {
          const shape = pictureShape(tile.image, fallback)
          return (
            <li data-placement={tile.key} key={tile.key}>
              {tile.label && <Label>{tile.label}</Label>}
              <TileLink tile={tile}>
                <span className="relative block overflow-hidden rounded-sm border border-rule bg-surface-2" style={{ aspectRatio: `${shape.width} / ${shape.height}` }}>
                  <Media fill imgClassName="object-contain" pictureClassName="contents" resource={tile.image} size="(min-width: 1024px) 22rem, (min-width: 640px) 50vw, 100vw" />
                </span>
              </TileLink>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

/** The home page rail (`home.rail`): up to ten tiles beside the news. */
export const HomeRail = ({ tiles }: { tiles: readonly Tile[] }) => <Rail tiles={tiles} zone="home.rail" />

/** The rail beside the stories on a section, topic, reporter or all-stories page (`list.rail`): the placements aimed at that page. */
export const ListRail = ({ tiles }: { tiles: readonly Tile[] }) => <Rail tiles={tiles} zone="list.rail" />

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
