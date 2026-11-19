import React from 'react'

import { paragraphs } from '@/lib/page-content'

import { SectionBand, SectionHeading } from '../SectionBand'
import { SectionLink } from '../parts'
import type { SectionData, SectionProps } from '../types'

export interface QuestionsData extends SectionData {
  items?: Array<{ id?: string | null; question?: string | null; answer?: string | null; linkLabel?: string | null; linkHref?: string | null } | null> | null
}

/** Questions. Real `<details>`, so they work without script and by keyboard. A row needs its question and its answer. */
export function QuestionsSection({ block }: SectionProps<QuestionsData>) {
  const rows = (block.items ?? []).filter((r): r is NonNullable<typeof r> => Boolean(r?.question?.trim() && r.answer?.trim()))
  if (rows.length === 0) return null
  return (
    <SectionBand block={block}>
      <SectionHeading heading={block.heading} />
      <div className="flex max-w-3xl flex-col">
        {rows.map((r, i) => (
          <details className="border-t [border-color:var(--tone-rule)] last:border-b" key={r.id ?? `${r.question}-${i}`}>
            <summary className="flex min-h-14 cursor-pointer items-center py-2 font-serif text-xl font-bold">{r.question}</summary>
            <div className="flex flex-col gap-2 pb-4 text-base">
              {paragraphs(r.answer).map((p) => (
                <p key={p}>{p}</p>
              ))}
              <SectionLink href={r.linkHref} label={r.linkLabel} />
            </div>
          </details>
        ))}
      </div>
    </SectionBand>
  )
}
