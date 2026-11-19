import React from 'react'

import { SectionBand, SectionHeading } from '../SectionBand'
import type { SectionData, SectionProps } from '../types'

export interface CheckListData extends SectionData {
  mark?: string | null
  items?: Array<{ id?: string | null; text?: string | null } | null> | null
}

const MARKS: Record<string, string> = { check: '✓', cross: '✕', dot: '•' }

/** Check list. The mark is decoration (the list is a list); a row needs its words. */
export function CheckListSection({ block }: SectionProps<CheckListData>) {
  const rows = (block.items ?? []).filter((r): r is NonNullable<typeof r> => Boolean(r?.text?.trim()))
  if (rows.length === 0) return null
  const mark = MARKS[block.mark ?? ''] ?? MARKS.check
  return (
    <SectionBand block={block}>
      <SectionHeading heading={block.heading} />
      <ul className="flex max-w-3xl list-none flex-col gap-3 p-0 text-lg">
        {rows.map((r, i) => (
          <li className="flex gap-3" key={r.id ?? `${r.text}-${i}`}>
            <span aria-hidden="true" className="shrink-0 font-bold">
              {mark}
            </span>
            <span>{r.text}</span>
          </li>
        ))}
      </ul>
    </SectionBand>
  )
}
