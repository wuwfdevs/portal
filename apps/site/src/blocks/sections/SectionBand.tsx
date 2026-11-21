import React from 'react'

import { SectionHeading as KitHeading } from '@/components/Kit'
import { paragraphs } from '@/lib/page-content'
import { isTone } from '@/lib/page-themes/themes'

import { eyebrowClass } from './parts'
import type { SectionData } from './types'

/**
 * The full-width band every section draws: it owns its own spacing, carries the section's anchor as its `id`, and its tone as
 * `data-tone`, which the page theme's stylesheet turns into a ground and the colours the content reads (`--tone-*`).
 *
 * `heading` is the optional eyebrow, title and intro. `more` is the section's link on to more of the same: it sits in the heading's row, at the
 * right, so the way on is in the header (the same place the home page's sections put theirs). A section with no heading has no header to put it
 * in, so its link follows the content. With the section's `placement` set to `side` the heading (and the `more` link) sit in a column beside the
 * content on a wide screen, as the sponsor boards compose a heading beside its cards; on a phone it is above, as always.
 */
export function SectionBand({ block, heading, more, children }: { block: SectionData & { placement?: string | null }; heading?: SectionData['heading']; more?: React.ReactNode; children: React.ReactNode }) {
  const tone = isTone(block.tone) ? block.tone : 'plain'
  if (block.inline) {
    // Inside Columns: no band, no container, no tone of its own. The band around the columns sets the ground and the colours.
    return (
      <div data-section={block.blockType} id={block.anchor || undefined} className="flex min-w-0 flex-col gap-6">
        <SectionHeading heading={heading} more={more} />
        {children}
        {hasHeading(heading) ? null : more}
      </div>
    )
  }
  const headed = hasHeading(heading)
  const side = block.placement === 'side' && headed
  return (
    <section data-section={block.blockType} data-tone={tone} id={block.anchor || undefined} className="py-12 md:py-14">
      {side ? (
        <div className="container grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:gap-12">
          <div className="flex flex-col items-start gap-5">
            <SectionHeading heading={heading} />
            {more}
          </div>
          <div className="flex min-w-0 flex-col gap-8">{children}</div>
        </div>
      ) : (
        <div className="container flex flex-col gap-8">
          <SectionHeading heading={heading} more={more} />
          {children}
          {headed ? null : more}
        </div>
      )}
    </section>
  )
}

/** Whether a heading has anything to draw. */
export function hasHeading(heading: SectionData['heading']): boolean {
  return Boolean(heading?.eyebrow?.trim() || heading?.title?.trim() || paragraphs(heading?.intro).length > 0)
}

/**
 * The optional eyebrow, title and intro at the head of a section, with the section's `more` link at the right of the same row when it has one.
 * Draws nothing when all three words are empty (and then the link is the caller's to place).
 */
export function SectionHeading({ heading, more }: { heading: SectionData['heading']; more?: React.ReactNode }) {
  const eyebrow = heading?.eyebrow?.trim()
  const title = heading?.title?.trim()
  const intro = paragraphs(heading?.intro)
  if (!hasHeading(heading)) return null
  const words = (
    <header className="flex max-w-[44rem] flex-col gap-3">
      {eyebrow && <p className={eyebrowClass}>{eyebrow}</p>}
      {title && (
        // The Kit's heading (serif 600) with the band's own highlight (`--tone-mark`); its colour is the band's text, not the station's ink, so a dark band's title is light.
        <KitHeading className="text-[color:var(--tone-text)] md:text-[2rem]" mark="tone">
          {title}
        </KitHeading>
      )}
      {intro.length > 0 && (
        <div className="flex flex-col gap-3 text-lg [color:var(--tone-muted)]">
          {intro.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      )}
    </header>
  )
  if (!more) return words
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
      {words}
      {more}
    </div>
  )
}
