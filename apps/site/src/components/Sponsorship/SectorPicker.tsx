'use client'

import Link from 'next/link'
import React, { useState } from 'react'

import { fill } from '@/lib/sponsorship/content'

export type Stat = { value: string; text: string }
export type Sector = { key: string; name: string; short: string; title: string; lead: string; local: Stat[]; national: Stat[] }

import { StatGrid, buttonPrimary, darkPill } from './parts'

/** "How this looks for your kind of business" (board 20): seven sector views, each with the smaller-county figures and the national ones. */
export const SectorPicker: React.FC<{ sectors: readonly Sector[]; copy: { groupLabel: string; local: string; national: string; talk: string } }> = ({ sectors, copy }) => {
  const [index, setIndex] = useState(0)
  const current = sectors[index] ?? sectors[0]
  if (!current) return null

  return (
    <div className="flex flex-col gap-6">
      <div aria-label={copy.groupLabel} className="flex flex-wrap gap-2" role="group">
        {sectors.map((s, i) => (
          <button aria-pressed={i === index} className={darkPill(i === index)} key={s.key} onClick={() => setIndex(i)} type="button">
            {s.name}
          </button>
        ))}
      </div>
      <div aria-live="polite" className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-8">
          <div className="flex max-w-3xl flex-col gap-1">
            <h3 className="font-serif text-2xl font-bold leading-tight md:text-3xl">{current.title}</h3>
            <p className="text-lg text-ink-2">{current.lead}</p>
          </div>
          <Link className={`${buttonPrimary} shrink-0 self-start`} href="/sponsor#inquire">
            {fill(copy.talk, { short: current.short })}
          </Link>
        </div>
        <div className="flex flex-col gap-2">
          <strong className="text-sm">{copy.local}</strong>
          <StatGrid columns={3} stats={current.local} />
        </div>
        <div className="flex flex-col gap-2">
          <strong className="text-sm">{copy.national}</strong>
          <StatGrid columns={3} stats={current.national} />
        </div>
      </div>
    </div>
  )
}
