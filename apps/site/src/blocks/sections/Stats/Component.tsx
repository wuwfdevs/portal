import React from 'react'

import { toStats } from '@/lib/page-content'
import { cn } from '@/utilities/ui'

import { SectionBand } from '../SectionBand'
import { SectionMore } from '../parts'
import type { SectionData, SectionProps } from '../types'

export interface StatsData extends SectionData {
  stats?: Array<{ id?: string | null; value?: string | null; text?: string | null; compare?: string | null } | null> | null
  valueLabel?: string | null
  compareLabel?: string | null
  placement?: string | null
  source?: string | null
  moreLabel?: string | null
  moreHref?: string | null
}

/** "79%" → 79; "79.5 %" → 79.5; anything else (a count, a dollar figure) → null, and the row draws no bar. Clamped to 0 to 100. */
export function percentOf(value: string | null | undefined): number | null {
  const m = /^\s*(\d{1,3}(?:\.\d+)?)\s*%\s*$/.exec(value ?? '')
  if (!m) return null
  return Math.min(100, Math.max(0, Number(m[1])))
}

/** Stats. A figure needs its number and its words; draws nothing when none has both. The source line is drawn under the figures. */
export function StatsSection({ block }: SectionProps<StatsData>) {
  const rows = toStats((block.stats ?? []).filter((r): r is NonNullable<typeof r> => Boolean(r)))
  if (rows.length === 0) return null
  const source = block.source?.trim()
  const compare = block.variant === 'compare'
  return (
    <SectionBand block={block} heading={block.heading} more={<SectionMore block={block} />}>
      {compare ? (
        <ul className="flex list-none flex-col gap-4 p-0">
          {rows.map((r, i) => {
            const a = percentOf(r.value)
            const b = percentOf(r.compare)
            return (
              <li className="flex flex-col gap-1.5" key={`${r.text}-${i}`}>
                <p className="max-w-3xl text-base">{r.text}</p>
                <Bar label={block.valueLabel} pct={a} value={r.value} />
                {r.compare && <Bar label={block.compareLabel} muted pct={b} value={r.compare} />}
              </li>
            )
          })}
        </ul>
      ) : (
        <ul className={cn('grid list-none gap-4 p-0 sm:grid-cols-2', block.placement === 'side' ? 'xl:grid-cols-3' : rows.length % 4 === 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
          {rows.map((r, i) => (
            <li className="flex flex-col gap-1.5 rounded-lg border p-5 [background-color:var(--tone-card)] [border-color:var(--tone-card-rule)]" key={`${r.text}-${i}`}>
              <span className="font-serif text-4xl font-bold leading-none">{r.value}</span>
              <span className="text-sm">{r.text}</span>
              {r.compare && <span className="text-sm [color:var(--tone-muted)]">{r.compare}</span>}
            </li>
          ))}
        </ul>
      )}
      {source && <p className="max-w-4xl text-sm [color:var(--tone-muted)]">{source}</p>}
          </SectionBand>
  )
}

function Bar({ label, value, pct, muted }: { label?: string | null; value: string; pct: number | null; muted?: boolean }) {
  const name = label?.trim()
  return (
    <div className="flex items-center gap-3">
      {pct !== null && (
        <div aria-hidden="true" className="h-3.5 max-w-[calc(100%-10rem)] rounded-[2px]" style={{ width: `${pct}%`, backgroundColor: muted ? 'var(--color-ink-4)' : 'var(--color-wuwf-lime-600)' }} />
      )}
      <span className={cn('text-sm', muted ? '[color:var(--tone-muted)]' : 'font-bold')}>
        {value}
        {name ? ` · ${name}` : ''}
      </span>
    </div>
  )
}
