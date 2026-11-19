import React from 'react'

import { cn } from '@/utilities/ui'

import { SectionBand } from '../SectionBand'
import type { SectionData, SectionProps } from '../types'

type Rows = Array<{ id?: string | null; text?: string | null; detail?: string | null } | null> | null | undefined
export interface CheckListData extends SectionData {
  listTitle?: string | null
  mark?: string | null
  items?: Rows
  second?: { title?: string | null; mark?: string | null; items?: Rows } | null
  placement?: string | null
}

const MARKS: Record<string, string> = { check: '✓', cross: '✕', dot: '•' }
const rowsOf = (items: Rows) => (items ?? []).filter((r): r is NonNullable<typeof r> => Boolean(r?.text?.trim()))

function List({ title, mark, rows }: { title?: string | null; mark?: string | null; rows: ReturnType<typeof rowsOf> }) {
  const glyph = MARKS[mark ?? ''] ?? MARKS.check
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {title?.trim() && <h3 className="font-serif text-xl font-bold">{title}</h3>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-base">
        {rows.map((r, i) => (
          <li className="flex gap-3 rounded-lg border px-4 py-3 [background-color:var(--tone-card)] [border-color:var(--tone-card-rule)]" key={r.id ?? `${r.text}-${i}`}>
            <span aria-hidden="true" className="shrink-0 font-bold [color:var(--tone-accent)]">
              {glyph}
            </span>
            <span className="flex flex-col">
              <span className={r.detail?.trim() ? 'font-bold' : undefined}>{r.text}</span>
              {r.detail?.trim() && <span className="text-sm [color:var(--tone-muted)]">{r.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Check list. The mark is decoration (the list is a list); a row needs its words. A second list draws beside the first. */
export function CheckListSection({ block }: SectionProps<CheckListData>) {
  const first = rowsOf(block.items)
  const second = rowsOf(block.second?.items)
  if (first.length === 0 && second.length === 0) return null
  const both = first.length > 0 && second.length > 0
  return (
    <SectionBand block={block} heading={block.heading}>
      <div className={cn('grid gap-8', both && 'lg:grid-cols-2', !both && 'max-w-3xl')}>
        {first.length > 0 && <List mark={block.mark} rows={first} title={block.listTitle} />}
        {second.length > 0 && <List mark={block.second?.mark} rows={second} title={block.second?.title} />}
      </div>
    </SectionBand>
  )
}
