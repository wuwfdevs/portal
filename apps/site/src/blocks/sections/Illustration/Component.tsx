import React from 'react'

import { SectionBand } from '../SectionBand'
import { eyebrowClass } from '../parts'
import type { SectionData, SectionProps } from '../types'

export interface IllustrationData extends SectionData {
  label?: string | null
  caption?: string | null
  name?: string | null
  line?: string | null
  website?: string | null
}

/** Illustration. Draws nothing without its label. Decorative: hidden from assistive technology. */
export function IllustrationSection({ block }: SectionProps<IllustrationData>) {
  const label = block.label?.trim()
  if (!label) return null
  return (
    <SectionBand block={block}>
      <figure aria-hidden="true" className="m-0 flex flex-col gap-2 rounded-lg border border-dashed p-4 [background-color:color-mix(in_srgb,var(--tone-text)_5%,transparent)] [border-color:var(--tone-muted)]">
        <figcaption className="text-xs font-bold uppercase tracking-[0.08em] [color:var(--tone-muted)]">{label}</figcaption>
        <div className="flex flex-col gap-0.5 rounded-sm border p-3 text-sm [background-color:var(--tone-card)] [border-color:var(--tone-card-rule)]">
          {block.caption?.trim() && <span className={eyebrowClass}>{block.caption}</span>}
          {block.name?.trim() && <strong>{block.name}</strong>}
          {block.line?.trim() && <span>{block.line}</span>}
          {block.website?.trim() && <span className="[color:var(--tone-accent)]">{block.website}</span>}
        </div>
      </figure>
    </SectionBand>
  )
}
