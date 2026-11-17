'use client'

import Link from 'next/link'
import React, { useState } from 'react'

import type { Goal } from '@/lib/sponsorship/goals'

import { buttonPrimary, darkPill } from './parts'

/** "Start with your goal" (board 16): pick the closest match and see a sample schedule. An example, not an offer. */
export const GoalPicker: React.FC<{ goals: readonly Goal[]; copy: { groupLabel: string; looksLike: string; cta: string } }> = ({ goals, copy }) => {
  const [index, setIndex] = useState(0)
  const current = goals[index] ?? goals[0]
  if (!current) return null

  return (
    <div className="flex flex-col gap-6">
      <div aria-label={copy.groupLabel} className="flex flex-wrap gap-2" role="group">
        {goals.map((g, i) => (
          <button aria-pressed={i === index} className={darkPill(i === index)} key={g.key} onClick={() => setIndex(i)} type="button">
            {g.name}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="grid gap-6 rounded-sm border border-rule-strong bg-surface p-6 md:p-8 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-3">
          <h3 className="font-serif text-2xl font-bold leading-tight md:text-3xl">{current.title}</h3>
          <p className="text-base text-ink-2">{current.lead}</p>
          <div className="mt-2 flex flex-col gap-1 border-t border-rule pt-4">
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-ink-3">{copy.looksLike}</span>
            <strong className="font-serif text-4xl font-bold leading-none">{current.total}</strong>
            <span className="text-sm text-ink-2">{current.span}</span>
          </div>
          <Link className={`${buttonPrimary} mt-2 self-start`} href="/sponsor#inquire">
            {copy.cta}
          </Link>
        </div>
        <ul className="m-0 flex list-none flex-col p-0">
          {current.mix.map((line) => (
            <li className="flex flex-col gap-1 border-t border-rule py-4 first:border-t-0 first:pt-0 sm:flex-row sm:justify-between sm:gap-6" key={`${line.channel}-${line.what}`}>
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-[0.08em] text-ink-3">{line.channel}</span>
                <strong className="text-lg">{line.what}</strong>
                <span className="text-sm text-ink-2">{line.detail}</span>
              </div>
              {line.price && <strong className="shrink-0 text-base sm:text-right">{line.price}</strong>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
