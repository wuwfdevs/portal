import React from 'react'

import { cn } from '@/utilities/ui'

import { relationId } from '@/lib/section-data/shape'

import { SectionBand } from '../SectionBand'
import type { SectionData, SectionProps } from '../types'

export interface FeaturePanelsData extends SectionData {
  radioLive?: boolean | null
  unearthing?: boolean | null
  unearthingEpisode?: unknown
}

/** Feature panels. Each panel that fails to load is left out and logged, so one feature never takes the other (or the page) down. */
export async function FeaturePanelsSection({ block }: SectionProps<FeaturePanelsData>) {
  const loaded = await import('@/lib/homepage/load-slots')
  const settle = async <T,>(name: string, load: () => Promise<T>): Promise<T | null> => {
    try {
      return await load()
    } catch (error) {
      console.error(`The ${name} panel could not be loaded and is left out.`, error)
      return null
    }
  }
  const [unearthing, radioLive] = await Promise.all([
    block.unearthing !== false ? settle('Unearthing Florida', () => loaded.loadUnearthingSlot(relationId(block.unearthingEpisode))) : null,
    block.radioLive !== false ? settle('RadioLive', loaded.loadRadioLiveSlot) : null,
  ])
  if (!unearthing && !radioLive) return null
  const { RadioLivePanel, UnearthingPanel } = await import('@/components/Homepage/Slots')
  return (
    <SectionBand block={block}>
      <div className={cn('grid gap-6', unearthing && radioLive && 'lg:grid-cols-2')}>
        {unearthing && <UnearthingPanel slot={unearthing} />}
        {radioLive && <RadioLivePanel slot={radioLive} />}
      </div>
    </SectionBand>
  )
}
