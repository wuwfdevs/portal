import React from 'react'

import { isTone } from '@/lib/page-themes/themes'

import type { SectionData } from './types'

/**
 * The full-width band every section draws: it owns its own spacing, carries the section's anchor as its `id`, and its tone as
 * `data-tone`, which the page theme's stylesheet turns into a ground and the colours the content reads (`--tone-*`).
 */
export function SectionBand({ block, children }: { block: SectionData; children: React.ReactNode }) {
  const tone = isTone(block.tone) ? block.tone : 'plain'
  return (
    <section data-section={block.blockType} data-tone={tone} id={block.anchor || undefined} className="py-12 md:py-16">
      <div className="container flex flex-col gap-8">{children}</div>
    </section>
  )
}

/** The optional eyebrow, title and intro at the head of a section. Draws nothing when all three are empty. */
export function SectionHeading({ heading }: { heading: SectionData['heading'] }) {
  const eyebrow = heading?.eyebrow?.trim()
  const title = heading?.title?.trim()
  const intro = heading?.intro?.trim()
  if (!eyebrow && !title && !intro) return null
  return (
    <header className="flex max-w-[44rem] flex-col gap-3">
      {eyebrow && <p className="text-sm font-bold uppercase tracking-wider [color:var(--tone-muted)]">{eyebrow}</p>}
      {title && <h2 className="font-serif text-3xl font-bold leading-tight md:text-4xl">{title}</h2>}
      {intro && <p className="text-lg [color:var(--tone-muted)]">{intro}</p>}
    </header>
  )
}
