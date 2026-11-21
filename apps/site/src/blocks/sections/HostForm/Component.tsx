import React from 'react'

import { SectionBand } from '../SectionBand'
import { lightFormCard } from '../listening-parts'
import type { SectionData, SectionProps } from '../types'

export type HostFormData = SectionData

/** The request form, in a card of its own so it is right on every tone. Loaded when the section draws (it sends through a server action to the Portal). */
export async function HostFormSection({ block }: SectionProps<HostFormData>) {
  const { HostForm } = await import('@/components/Listening/HostForm')
  return (
    <SectionBand block={block} heading={block.heading}>
      <div className={`max-w-3xl ${lightFormCard}`}>
        <HostForm />
      </div>
    </SectionBand>
  )
}
