import React from 'react'

import { paragraphs } from '@/lib/page-content'

import { SectionBand } from '../SectionBand'
import type { SectionData, SectionProps } from '../types'

export interface CalloutData extends SectionData {
  title?: string | null
  text?: string | null
  cite?: string | null
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
        <figure className="flex max-w-3xl flex-col gap-3 border-l-4 py-2 pl-6 [border-color:var(--tone-rule)]">
          {title && <figcaption className="text-sm font-bold uppercase tracking-wider [color:var(--tone-muted)]">{title}</figcaption>}
          <blockquote className="flex flex-col gap-3 font-serif text-2xl leading-snug">
            {paras.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </blockquote>
          {cite && <p className="text-base [color:var(--tone-muted)]">{cite}</p>}
        </figure>
      </SectionBand>
    )
  }
  return (
    <SectionBand block={block}>
      <div className="flex max-w-3xl flex-col gap-2 rounded-sm border p-6 [background-color:color-mix(in_srgb,var(--tone-text)_8%,transparent)] [border-color:var(--tone-rule)]">
        {title && <h2 className="font-serif text-2xl font-bold">{title}</h2>}
        {paras.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
    </SectionBand>
  )
}
