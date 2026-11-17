'use client'

import Link from 'next/link'
import React, { useState } from 'react'

import { formatMoney } from '@/lib/sponsorship/money'
import { CREDIT_COUNTS, DAYPARTS, TERMS, estimateSchedule, type TermKey } from '@/lib/sponsorship/rates'

import { buttonPrimary, pill } from './parts'

/**
 * The rate card (board 17, "By the credit") and the schedule estimate under it. Selecting a row picks the daypart; the estimate
 * is a starting point only, WUWF confirms every schedule. The table is real table markup with a button in each row's first cell.
 */
export const RateEstimator: React.FC = () => {
  const [daypart, setDaypart] = useState<string>(DAYPARTS[0]!.key)
  const [term, setTerm] = useState<TermKey>('1y')
  const [credits, setCredits] = useState<number>(26)
  const estimate = estimateSchedule({ daypart, term, credits })

  return (
    <div className="flex flex-col gap-8">
      <div className="overflow-x-auto rounded-sm border border-rule-strong bg-surface">
        <table className="w-full min-w-[40rem] border-collapse text-left text-[0.9375rem]">
          <caption className="sr-only">On-air rate card: price per credit by daypart and length of commitment. Choose a row to use it in the estimate below.</caption>
          <thead>
            <tr className="bg-surface-2 text-sm">
              <th className="px-4 py-3 font-bold" scope="col">
                Daypart
              </th>
              <th className="px-4 py-3 font-bold" scope="col">
                When
              </th>
              {TERMS.map((t) => (
                <th className="px-4 py-3 text-right font-bold" key={t.key} scope="col">
                  {t.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYPARTS.map((d) => {
              const on = d.key === daypart
              return (
                <tr className={on ? 'bg-wuwf-blue-100' : 'bg-surface'} key={d.key}>
                  <th className="border-t border-rule p-0 text-left font-bold" scope="row">
                    <button
                      aria-pressed={on}
                      className="flex min-h-14 w-full cursor-pointer items-center px-4 text-left font-bold hover:underline"
                      onClick={() => setDaypart(d.key)}
                      type="button"
                    >
                      {d.label}
                    </button>
                  </th>
                  <td className="border-t border-rule px-4 py-2 text-ink-2">{d.when}</td>
                  {d.cents.map((c, i) => (
                    <td className="border-t border-rule px-4 py-2 text-right tabular-nums" key={TERMS[i]!.key}>
                      {formatMoney(c)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-ink-3">
        Total Program Rotation credits rotate through the day and evening programming. Select a row to use it in the estimate below.
      </p>

      <div className="grid gap-6 rounded-sm border border-rule-strong bg-surface p-6 md:p-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-wuwf-blue-700">Rough it out</span>
            <h3 className="font-serif text-2xl font-bold leading-tight md:text-3xl">Estimate your schedule</h3>
          </div>
          <div aria-label="Commitment" className="flex flex-col gap-2" role="group">
            <strong className="text-sm">Commitment</strong>
            <div className="flex flex-wrap gap-2">
              {TERMS.map((t) => (
                <button aria-pressed={t.key === term} className={pill(t.key === term)} key={t.key} onClick={() => setTerm(t.key)} type="button">
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div aria-label="Number of credits" className="flex flex-col gap-2" role="group">
            <strong className="text-sm">Number of credits</strong>
            <div className="flex flex-wrap gap-2">
              {CREDIT_COUNTS.map((n) => (
                <button aria-pressed={n === credits} className={pill(n === credits)} key={n} onClick={() => setCredits(n)} type="button">
                  {n} credits
                </button>
              ))}
            </div>
          </div>
        </div>

        <div aria-live="polite" className="flex flex-col gap-2 rounded-sm bg-surface-2 p-5">
          <span className="text-xs font-bold uppercase tracking-[0.08em] text-ink-3">Your estimate</span>
          {estimate && (
            <>
              <strong className="text-lg">{estimate.title}</strong>
              <strong className="font-serif text-5xl font-bold leading-none">{estimate.total}</strong>
              <span className="text-base text-ink-2">{estimate.detail}</span>
              <span className="text-sm text-ink-2">{estimate.prepaid}</span>
              <span className="text-sm text-ink-2">{estimate.nonprofit}</span>
            </>
          )}
          <span className="mt-2 text-sm text-ink-3">A starting point only. WUWF confirms every schedule and price.</span>
          <Link className={`${buttonPrimary} mt-2 self-start`} href="/sponsor#inquire">
            Get a proposal for this schedule
          </Link>
        </div>
      </div>
    </div>
  )
}
