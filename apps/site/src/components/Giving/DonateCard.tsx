'use client'

import React, { useId, useState } from 'react'

import type { DonateFrequency } from '@/lib/giving/donate'
import { cn } from '@/utilities/ui'

import { ButtonLink, CheckList } from '../PageParts'

/**
 * The gift card on the Give page (board 14): how often, how much, what that comes to, and one button to WUWF's donation form.
 * Everything it shows for each choice was worked out on the server (`buildDonateModel`), so all this keeps is what is selected.
 * Real radio buttons in two fieldsets: arrow keys, a legend, and the chosen one marked by fill and weight, not colour alone.
 * It takes no payment and keeps nothing; the gift is made on the donation form it links to.
 */
export const DonateCard: React.FC<{
  frequencies: DonateFrequency[]
  /** The line under the button. */
  note?: string | null
  /** Drawn in place of the button while there is no donation form to send a gift to. */
  unavailable?: React.ReactNode
}> = ({ frequencies, note, unavailable }) => {
  const id = useId()
  const [frequency, setFrequency] = useState(frequencies[0]!.key)
  const [chosen, setChosen] = useState(() => Object.fromEntries(frequencies.map((f) => [f.key, f.defaultKey])))

  const current = frequencies.find((f) => f.key === frequency) ?? frequencies[0]!
  const option = current.options.find((o) => o.key === chosen[current.key]) ?? current.options[0]!
  const focus = 'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-wuwf-blue-700'

  return (
    <div aria-label="Make a gift" className="flex flex-col gap-4 rounded-md bg-surface p-6 text-ink md:p-7" role="group">
      {frequencies.length > 1 && (
        <fieldset className="m-0 grid min-w-0 grid-cols-2 gap-1 rounded-md border-0 bg-surface-3 p-1">
          <legend className="sr-only">How often</legend>
          {frequencies.map((f) => {
            const on = f.key === current.key
            return (
              <label className={cn('flex min-h-14 cursor-pointer flex-col items-center justify-center rounded-sm px-3 py-2', focus, on ? 'bg-surface text-ink shadow-1' : 'text-ink-3 hover:text-ink')} key={f.key}>
                <input checked={on} className="sr-only" name={`${id}-frequency`} onChange={() => setFrequency(f.key)} type="radio" value={f.key} />
                <strong>{f.label}</strong>
                {f.sub && <span className="text-xs">{f.sub}</span>}
              </label>
            )
          })}
        </fieldset>
      )}

      <fieldset className="m-0 grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,6rem),1fr))] gap-2 border-0 p-0">
        <legend className="sr-only">Amount</legend>
        {current.options.map((o) => {
          const on = o.key === option.key
          return (
            <label
              className={cn('flex min-h-14 cursor-pointer items-center justify-center rounded-sm px-3 text-xl font-bold', focus, on ? 'border-2 border-wuwf-blue-700 bg-wuwf-blue-700 text-surface' : 'border border-rule-strong bg-surface text-ink hover:bg-surface-2')}
              key={o.key}
            >
              <input checked={on} className="sr-only" name={`${id}-amount-${current.key}`} onChange={() => setChosen((c) => ({ ...c, [current.key]: o.key }))} type="radio" value={o.key} />
              {o.label}
            </label>
          )
        })}
      </fieldset>

      <div aria-live="polite" className="flex flex-col gap-2 rounded-sm bg-wuwf-blue-100 p-4">
        <strong className="text-[0.9375rem] text-wuwf-blue-700">{option.title}</strong>
        <CheckList items={option.benefits} className="text-sm" />
      </div>

      {option.href ? <ButtonLink className="min-h-[3.25rem] w-full text-[1.0625rem]" href={option.href} label={option.cta} /> : unavailable}
      {option.href && note && <p className="text-center text-[0.8125rem] text-ink-3">{note}</p>}
    </div>
  )
}
