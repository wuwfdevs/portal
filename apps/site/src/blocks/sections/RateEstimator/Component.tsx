import React from 'react'

import { rateCard } from '@/lib/sponsorship/rates'

import { SectionBand } from '../SectionBand'
import type { SectionData, SectionProps } from '../types'
import { Estimator } from './Estimator'

export interface RateEstimatorData extends SectionData {
  note?: string | null
  estimatorEyebrow?: string | null
  estimatorTitle?: string | null
  commitmentLabel?: string | null
  creditsLabel?: string | null
  estimatorDisclaimer?: string | null
  estimatorCta?: string | null
}

const t = (s: string | null | undefined): string => s?.trim() ?? ''

/** Rate estimator. Reads the rate card from the Sponsorship settings; draws nothing without a daypart or a schedule size. */
export async function RateEstimatorSection({ block }: SectionProps<RateEstimatorData>) {
  const { loadSponsorshipSettings } = await import('@/lib/sponsorship/load')
  const { settings } = await loadSponsorshipSettings()
  const card = rateCard(settings)
  if (card.rows.length === 0 || card.counts.length === 0) return null
  return (
    <SectionBand block={block} heading={block.heading}>
      <Estimator
        card={card}
        copy={{
          note: t(block.note),
          eyebrow: t(block.estimatorEyebrow),
          title: t(block.estimatorTitle),
          disclaimer: t(block.estimatorDisclaimer),
          cta: t(block.estimatorCta),
          commitment: t(block.commitmentLabel) || 'Length of commitment',
          credits: t(block.creditsLabel) || 'Credits in the schedule',
        }}
      />
    </SectionBand>
  )
}
