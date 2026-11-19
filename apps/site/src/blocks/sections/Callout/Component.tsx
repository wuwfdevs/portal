import React from 'react'

import { paragraphs } from '@/lib/page-content'

import { SectionBand } from '../SectionBand'
import { SectionMore } from '../parts'
import type { SectionData, SectionProps } from '../types'

export interface CalloutData extends SectionData {
  title?: string | null
  text?: string | null
  cite?: string | null
  moreLabel?: string | null
  moreHref?: string | null
}

/** Callout. Draws nothing without its text. The tint is the band's own text colour at a low strength, so it is right on every tone. */
export function CalloutSection({ block }: SectionProps<CalloutData>) {
  const paras = paragraphs(block.text)
  if (paras.length === 0) return null
  const title = block.title?.trim()
  if (block.variant === 'quote') {
    const cite = block.cite?.trim()
    return (
      <SectionBand block={block}>
        <figure className="m-0 flex max-w-3xl flex-col gap-3 rounded-sm p-6 [background-color:var(--tone-tint)]">
          {title && <figcaption className="text-xs font-bold uppercase tracking-[0.08em] [color:var(--tone-accent)]">{title}</figcaption>}
          <blockquote className="flex flex-col gap-3 font-serif text-2xl leading-snug">
            {paras.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </blockquote>
          {cite && <p className="text-base [color:var(--tone-muted)]">{cite}</p>}
          <SectionMore block={block} />
        </figure>
      </SectionBand>
    )
  }
  return (
    <SectionBand block={block}>
      <div className="flex flex-col gap-4 rounded-sm p-6 md:flex-row md:items-center md:justify-between md:gap-8 [background-color:var(--tone-tint)]">
        <div className="flex max-w-3xl flex-col gap-2">
          {title && <h2 className="font-serif text-xl font-bold leading-tight">{title}</h2>}
          {paras.map((p) => (
            <p className="text-base" key={p}>
              {p}
            </p>
          ))}
        </div>
        <SectionMore block={block} />
      </div>
    </SectionBand>
  )
}
