import React from 'react'

import { CtaCard } from '../CtaCard'
import { SectionBand } from '../SectionBand'
import type { ActionData } from '../parts'
import type { SectionData, SectionProps } from '../types'

export interface ClosingBandData extends SectionData {
  actions?: ActionData[] | null
}

/**
 * Closing band: a call to action drawn as a card (`CtaCard`) with a title, a sentence and one or two buttons. Draws nothing without a title. The band around the card is the page's ground and the
 * editor's tone is the card's colour; two call-to-action sections in a row share one band (`RenderSections`), side by side on a wide screen, so they are not two full-width bands stacked.
 */
export function ClosingBandSection({ block }: SectionProps<ClosingBandData>) {
  const title = block.heading?.title?.trim()
  if (!title) return null
  return (
    <SectionBand block={{ ...block, tone: 'plain' }}>
      <CtaCard actions={block.actions ?? []} eyebrow={block.heading?.eyebrow?.trim()} intro={block.heading?.intro?.trim()} title={title} tone={block.tone} />
    </SectionBand>
  )
}
