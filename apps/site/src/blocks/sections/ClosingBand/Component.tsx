import React from 'react'

import { SectionBand } from '../SectionBand'
import { eyebrowClass, SectionActions } from '../parts'
import type { ActionData } from '../parts'
import type { SectionData, SectionProps } from '../types'

export interface ClosingBandData extends SectionData {
  actions?: ActionData[] | null
}

/** Closing band: a title and a sentence on the left, one or two buttons on the right. Draws nothing without a title. */
export function ClosingBandSection({ block }: SectionProps<ClosingBandData>) {
  const title = block.heading?.title?.trim()
  if (!title) return null
  const eyebrow = block.heading?.eyebrow?.trim()
  const intro = block.heading?.intro?.trim()
  return (
    <SectionBand block={block}>
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-12">
        <div className="flex max-w-2xl flex-col gap-2">
          {eyebrow && <p className={eyebrowClass}>{eyebrow}</p>}
          <h2 className="font-serif text-3xl font-bold leading-tight md:text-4xl">{title}</h2>
          {intro && <p className="text-lg">{intro}</p>}
        </div>
        <SectionActions actions={block.actions} className="shrink-0" />
      </div>
    </SectionBand>
  )
}
