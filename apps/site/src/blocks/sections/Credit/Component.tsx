import React from 'react'

import { Acknowledgment } from '@/components/Acknowledgment'
import { creditSpecOf } from '@/lib/section-data/specs'

import { SectionBand } from '../SectionBand'
import type { SectionData, SectionProps } from '../types'

export interface CreditData extends SectionData {
  target?: unknown
}

export interface CreditView {
  lines: Array<{ agreementId: string | number; text: string }>
  hubHref: string | null
  independenceHref: string | null
  subject: 'reporting' | 'program'
}

/** The panel in a band. Draws nothing without a line. */
export function CreditPanel({ block, credit }: { block: CreditData; credit: CreditView }) {
  if (credit.lines.length === 0) return null
  return (
    <SectionBand block={block}>
      <div className="max-w-3xl">
        <Acknowledgment
          headingId={`credit-${block.id ?? block.anchor ?? 'x'}`}
          hubHref={credit.hubHref}
          independenceHref={credit.independenceHref}
          lines={credit.lines as never}
          subject={credit.subject}
        />
      </div>
    </SectionBand>
  )
}

/** Credit. Draws nothing without a record, or when its agreements are not running. */
export async function CreditSection({ block }: SectionProps<CreditData>) {
  const spec = creditSpecOf(block)
  if (!spec) return null
  const { loadCredit } = await import('@/lib/section-data/load')
  return <CreditPanel block={block} credit={await loadCredit(spec)} />
}
