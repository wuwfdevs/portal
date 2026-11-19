import React from 'react'

import { toStats } from '@/lib/page-content'

import { SectionBand, SectionHeading } from '../SectionBand'
import type { SectionData, SectionProps } from '../types'

export interface StatsData extends SectionData {
  stats?: Array<{ id?: string | null; value?: string | null; text?: string | null; compare?: string | null } | null> | null
  valueLabel?: string | null
  compareLabel?: string | null
  source?: string | null
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
    <SectionBand block={block}>
      <SectionHeading heading={block.heading} />
      {compare ? (
        <ul className="flex list-none flex-col gap-8 p-0">
          {rows.map((r, i) => {
            const a = percentOf(r.value)
            const b = percentOf(r.compare)
            return (
              <li className="flex flex-col gap-3" key={`${r.text}-${i}`}>
                <p className="max-w-3xl text-lg font-bold">{r.text}</p>
                <Bar label={block.valueLabel} pct={a} value={r.value} />
                {r.compare && <Bar label={block.compareLabel} muted pct={b} value={r.compare} />}
              </li>
            )
          })}
        </ul>
      ) : (
        <ul className="grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r, i) => (
            <li className="flex flex-col gap-2 border-t-4 pt-4 [border-color:var(--tone-rule)]" key={`${r.text}-${i}`}>
              <span className="font-serif text-5xl font-bold leading-none">{r.value}</span>
              <span className="text-lg">{r.text}</span>
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
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-3">
        <span className="font-serif text-3xl font-bold leading-none">{value}</span>
        {name && <span className="text-base [color:var(--tone-muted)]">{name}</span>}
      </div>
      {pct !== null && (
        <div aria-hidden="true" className="h-3 w-full overflow-hidden rounded-sm border [border-color:var(--tone-rule)]">
          <div className="h-full" style={{ width: `${pct}%`, backgroundColor: muted ? 'var(--tone-rule)' : 'var(--tone-button)' }} />
        </div>
      )}
    </div>
  )
}
