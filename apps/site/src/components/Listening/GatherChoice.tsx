'use client'

import React, { useId, useState } from 'react'

import { cn } from '@/utilities/ui'
import type { GatherMode } from '@/lib/listening/talk'

import { HostForm } from './HostForm'
import { KitchenTable } from './KitchenTable'
import { label } from './styles'

type Way = 'table' | 'request'

const WAYS: Record<Way, { title: string; body: string; tags: string[] }> = {
  table: {
    title: 'Just a few of us, starting now',
    body: 'You and a few other people at your own table, on your own phone. The phone records the conversation. Nothing is public, and nobody at WUWF has to schedule anything.',
    tags: ['Starts right away', 'Private'],
  },
  request: {
    title: 'A bigger group, a public gathering, or with WUWF’s help',
    body: 'Invite a larger group, open it to anyone, or ask a WUWF journalist to join. Tell us what you have in mind and someone at WUWF will write back within a week.',
    tags: ['WUWF sets it up with you', 'Can be public'],
  },
}

/**
 * How to gather people around a question. When the question allows both ways, the reader chooses in plain terms (size, and whether WUWF is
 * involved) and the form for that choice appears under it; when it allows one, there is no choice to make and the form is the page. The
 * "table" form starts a private one-table session on this phone; the "request" form is a request staff read and schedule.
 */
export const GatherChoice: React.FC<{ query: { publicId: string; title: string }; mode: Exclude<GatherMode, 'none'> }> = ({ query, mode }) => {
  const name = useId()
  const [way, setWay] = useState<Way>('table')
  const active: Way = mode === 'choose' ? way : mode

  return (
    <div className="flex flex-col gap-8">
      {mode === 'choose' && (
        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className={cn(label, 'mb-3')}>Choose one</legend>
          {(Object.keys(WAYS) as Way[]).map((choice) => (
            <label
              className={cn(
                'flex cursor-pointer gap-3 rounded-lg border p-5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-wuwf-blue-700',
                active === choice ? 'border-ink bg-surface-2 shadow-[inset_0_0_0_1px_var(--color-ink)]' : 'border-rule-strong bg-surface',
              )}
              key={choice}
            >
              <input checked={active === choice} className="mt-1 size-5 shrink-0 accent-wuwf-blue-700" name={name} onChange={() => setWay(choice)} type="radio" value={choice} />
              <span className="flex flex-col gap-1.5">
                <span className="text-lg font-bold">{WAYS[choice].title}</span>
                <span className="text-base leading-relaxed text-ink-2">{WAYS[choice].body}</span>
                <span className="mt-1 flex flex-wrap gap-2">
                  {WAYS[choice].tags.map((tag, i) => (
                    <span className={cn('inline-flex min-h-[26px] items-center rounded-pill px-2.5 text-[0.6875rem] font-bold uppercase tracking-[0.05em]', i === 0 ? 'bg-wuwf-blue-100 text-wuwf-blue-700' : 'bg-surface-3 text-ink-2')} key={tag}>
                      {tag}
                    </span>
                  ))}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="max-w-xl rounded-lg border border-rule-strong bg-surface p-6 text-ink md:p-7">
        <h2 className="mb-5 font-serif text-2xl font-semibold">{active === 'table' ? 'Start your table' : 'Tell us what you have in mind'}</h2>
        {active === 'table' ? <KitchenTable bare query={query} /> : <HostForm questions={[query]} />}
      </div>
    </div>
  )
}
