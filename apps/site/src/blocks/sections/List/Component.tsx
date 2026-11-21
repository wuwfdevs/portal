import Link from 'next/link'
import React from 'react'

import { ClipRail } from '@/components/Video/ClipRail'
import { listSpecOf } from '@/lib/section-data/specs'
import type { ListItem } from '@/lib/section-data/shape'
import type { ClipView } from '@/lib/video/load'

import { SectionBand } from '../SectionBand'
import { safeHref } from '@/lib/section-links'

import { SectionImage, SectionLink } from '../parts'
import type { SectionData, SectionProps } from '../types'

export interface ListData extends SectionData {
  source?: string | null
  scope?: string | null
  section?: unknown
  topic?: unknown
  show?: unknown
  allShows?: boolean | null
  count?: number | null
  moreLabel?: string | null
  moreHref?: string | null
}

const eyebrow = 'text-sm [color:var(--tone-muted)]'

/** An entry's title, linked when it has an address (the whole card is the link's box, so there is one link per card). */
function Title({ item, className }: { item: ListItem; className: string }) {
  const href = safeHref(item.href)
  return (
    <h3 className={className}>
      {href ? (
        <Link className="after:absolute after:inset-0 hover:underline" href={href}>
          {item.title}
        </Link>
      ) : (
        item.title
      )}
    </h3>
  )
}

/** An entry's lines of words (a show's tagline, then its summary), one paragraph each. Nothing when it has none. */
function Summary({ item }: { item: ListItem }) {
  const lines = (item.summary ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null
  return (
    <>
      {lines.map((line, i) => (
        <p className={i === 0 && lines.length > 1 ? 'text-sm [color:var(--tone-muted)]' : 'text-base'} key={i}>
          {line}
        </p>
      ))}
    </>
  )
}

function Picture({ item, className }: { item: ListItem; className: string }) {
  return item.image ? (
    <div className={`overflow-hidden rounded-4 ${className}`}>
      <SectionImage className="size-full" image={item.image} imgClassName="size-full object-cover" />
    </div>
  ) : null
}

/** The four layouts over the same entries. Draws nothing without an entry. */
export function ListView({ block, items }: { block: ListData; items: readonly ListItem[] }) {
  if (items.length === 0) return null
  const variant = block.variant
  const more = <SectionLink href={block.moreHref} label={block.moreLabel} />
  let body: React.ReactNode
  if (variant === 'rail') {
    body = (
      <ul aria-label={block.heading?.title?.trim() || 'Scrolls sideways'} className="flex list-none snap-x snap-mandatory gap-4 overflow-x-auto p-0 pb-3" role="region" tabIndex={0}>
        {items.map((item) => (
          <li className="relative flex w-64 shrink-0 snap-start flex-col gap-2" key={item.id}>
            <Picture className="aspect-video" item={item} />
            {item.meta && <p className={eyebrow}>{item.meta}</p>}
            <Title className="font-serif text-lg font-bold" item={item} />
          </li>
        ))}
      </ul>
    )
  } else if (variant === 'numbered') {
    body = (
      <ol className="flex max-w-3xl list-none flex-col p-0">
        {items.map((item, i) => (
          <li className="relative flex items-start gap-5 border-t py-4 last:border-b [border-color:var(--tone-rule)]" key={item.id}>
            <span aria-hidden="true" className="w-10 shrink-0 font-serif text-4xl font-bold leading-none">
              {i + 1}
            </span>
            <div className="flex flex-col gap-1">
              <Title className="font-serif text-xl font-bold" item={item} />
              {item.meta && <p className={eyebrow}>{item.meta}</p>}
            </div>
          </li>
        ))}
      </ol>
    )
  } else if (variant === 'lead') {
    const [lead, ...rest] = items
    body = (
      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <div className="relative flex flex-col gap-3">
          <Picture className="aspect-[3/2]" item={lead!} />
          {lead!.meta && <p className={eyebrow}>{lead!.meta}</p>}
          <Title className="font-serif text-3xl font-bold leading-tight" item={lead!} />
        </div>
        {rest.length > 0 && (
          <ul className="flex list-none flex-col p-0">
            {rest.map((item) => (
              <li className="relative flex flex-col gap-1 border-t py-4 first:border-t-0 first:pt-0 [border-color:var(--tone-rule)]" key={item.id}>
                {item.meta && <p className={eyebrow}>{item.meta}</p>}
                <Title className="font-serif text-xl font-bold" item={item} />
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  } else if (variant === 'tiles') {
    body = (
      <ul className="grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li className="relative flex flex-col overflow-hidden rounded-lg border [background:var(--tone-card)] [border-color:var(--tone-card-rule)]" key={item.id}>
            <Picture className="aspect-square rounded-none" item={item} />
            <div className="flex flex-col gap-1 p-4">
              <Title className="font-serif text-xl font-bold leading-snug" item={item} />
              <Summary item={item} />
              {item.meta && <p className="mt-1 text-xs font-semibold [color:var(--tone-muted)]">{item.meta}</p>}
            </div>
          </li>
        ))}
      </ul>
    )
  } else if (variant === 'rows') {
    body = (
      <ol className="flex max-w-3xl list-none flex-col p-0">
        {items.map((item) => (
          <li className="relative flex flex-col gap-1 border-t py-4 last:border-b [border-color:var(--tone-rule)]" key={item.id}>
            {item.meta && <p className={eyebrow}>{item.meta}</p>}
            <Title className="font-serif text-xl font-bold leading-snug" item={item} />
            <Summary item={item} />
          </li>
        ))}
      </ol>
    )
  } else {
    body = (
      <ul className="grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li className="relative flex flex-col gap-3" key={item.id}>
            <Picture className="aspect-[3/2]" item={item} />
            {item.meta && <p className={eyebrow}>{item.meta}</p>}
            <Title className="font-serif text-xl font-bold" item={item} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <SectionBand block={block} heading={block.heading} more={more}>
      {body}
    </SectionBand>
  )
}

/**
 * A List of short videos: the poster rail (`ClipRail`, the same one the home page and the section pages draw), in the band's tone. It has one layout, so the
 * variant is not used. Draws nothing without clips.
 */
export function ClipListView({ block, clips }: { block: ListData; clips: readonly ClipView[] }) {
  if (clips.length === 0) return null
  return (
    <SectionBand block={block} heading={block.heading} more={<SectionLink href={block.moreHref} label={block.moreLabel} />}>
      <ClipRail clips={clips} label={block.heading?.title?.trim() || 'Short videos'} toned />
    </SectionBand>
  )
}

/** List. Draws nothing when its source needs a choice that is not made, or when there is nothing published to list. */
export async function ListSection({ block }: SectionProps<ListData>) {
  const spec = listSpecOf(block)
  if (!spec) return null
  const loaded = await import('@/lib/section-data/load')
  if (spec.source === 'clips') return <ClipListView block={block} clips={await loaded.loadClipList(spec)} />
  return <ListView block={block} items={await loaded.loadList(spec)} />
}
