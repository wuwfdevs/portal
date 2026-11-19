import React from 'react'

import { paragraphs } from '@/lib/page-content'
import { isTone } from '@/lib/page-themes/themes'

import { eyebrowClass } from './parts'
import type { SectionData } from './types'

/**
 * The full-width band every section draws: it owns its own spacing, carries the section's anchor as its `id`, and its tone as
 * `data-tone`, which the page theme's stylesheet turns into a ground and the colours the content reads (`--tone-*`).
 *
 * `heading` is the optional eyebrow, title and intro. With the section's `placement` set to `side` the heading (and the `more` link) sit in a
 * column beside the content on a wide screen, as the sponsor boards compose a heading beside its cards; on a phone it is above, as always.
 */
export function SectionBand({ block, heading, more, children }: { block: SectionData & { placement?: string | null }; heading?: SectionData['heading']; more?: React.ReactNode; children: React.ReactNode }) {
  const tone = isTone(block.tone) ? block.tone : 'plain'
  if (block.inline) {
    // Inside Columns: no band, no container, no tone of its own. The band around the columns sets the ground and the colours.
    return (
      <div data-section={block.blockType} id={block.anchor || undefined} className="flex min-w-0 flex-col gap-6">
        <SectionHeading heading={heading} />
        {children}
        {more}
      </div>
    )
  }
  const head = <SectionHeading heading={heading} />
  const side = block.placement === 'side' && Boolean(heading?.eyebrow?.trim() || heading?.title?.trim() || heading?.intro?.trim())
  return (
    <section data-section={block.blockType} data-tone={tone} id={block.anchor || undefined} className="py-12 md:py-14">
      {side ? (
        <div className="container grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:gap-12">
          <div className="flex flex-col items-start gap-5">
            {head}
            {more}
          </div>
          <div className="flex min-w-0 flex-col gap-8">{children}</div>
        </div>
      ) : (
        <div className="container flex flex-col gap-8">
          {head}
          {children}
          {more}
        </div>
      )}
    </section>
  )
}

/** The optional eyebrow, title and intro at the head of a section. Draws nothing when all three are empty. */
export function SectionHeading({ heading }: { heading: SectionData['heading'] }) {
  const eyebrow = heading?.eyebrow?.trim()
  const title = heading?.title?.trim()
  const intro = paragraphs(heading?.intro)
  if (!eyebrow && !title && intro.length === 0) return null
  return (
    <header className="flex max-w-[44rem] flex-col gap-3">
      {eyebrow && <p className={eyebrowClass}>{eyebrow}</p>}
      {title && <h2 className="font-serif text-3xl font-bold leading-tight md:text-[2rem]">{title}</h2>}
      {intro.length > 0 && (
        <div className="flex flex-col gap-3 text-lg [color:var(--tone-muted)]">
          {intro.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      )}
    </header>
  )
}
