import React from 'react'

import { readThanks, thanksText } from '@/lib/giving/thanks'

import { SectionBand } from '../SectionBand'
import { SectionActions, SectionLink, eyebrowClass, type ActionData } from '../parts'
import type { SectionData, SectionProps } from '../types'

export interface ThankYouData extends SectionData {
  label?: string | null
  title?: string | null
  titleNamed?: string | null
  body?: string | null
  bodyMonthly?: string | null
  bodyOnce?: string | null
  actions?: ActionData[] | null
  nextTitle?: string | null
  next?: Array<{ id?: string | null; lead?: string | null; text?: string | null } | null> | null
  promptTitle?: string | null
  promptLabel?: string | null
  promptHref?: string | null
}

/**
 * Thank-you. What it says of the gift comes from the query a coded route hands in (`context.query`), read strictly by `readThanks`; with none of it the
 * plain words are used, and a template whose name or amount is missing is never printed. Draws nothing without a title.
 */
export function ThankYouSection({ block, context }: SectionProps<ThankYouData>) {
  const gift = readThanks(context.query ?? {})
  const { title, body } = thanksText(
    { title: block.title ?? '', titleNamed: block.titleNamed ?? '', body: block.body ?? '', bodyMonthly: block.bodyMonthly ?? '', bodyOnce: block.bodyOnce ?? '' },
    gift,
  )
  if (!title.trim()) return null
  const steps = (block.next ?? []).filter((s): s is NonNullable<typeof s> => Boolean(s?.lead?.trim()))
  const label = block.label?.trim()
  const hasAside = steps.length > 0 || Boolean(block.promptTitle?.trim())

  const aside = hasAside && (
    <div className="flex flex-col gap-3.5 rounded-lg border p-7 [background-color:var(--tone-card)] [border-color:var(--tone-card-rule)]">
      {block.nextTitle?.trim() && <strong className="text-[1.0625rem]">{block.nextTitle}</strong>}
      {steps.length > 0 && (
        <ol className="m-0 flex list-none flex-col gap-3 p-0 text-[0.9375rem]">
          {steps.map((s, i) => (
            <li className="flex gap-2.5" key={s.id ?? s.lead}>
              <strong aria-hidden="true" className="[color:var(--tone-accent)]">
                {i + 1}
              </strong>
              <span>
                <strong>{s.lead}</strong> {s.text}
              </span>
            </li>
          ))}
        </ol>
      )}
      {block.promptTitle?.trim() && (
        <div className="flex flex-col gap-1.5 border-t pt-3 [border-color:var(--tone-card-rule)]">
          <strong className="text-[0.9375rem]">{block.promptTitle}</strong>
          <SectionLink href={block.promptHref} label={block.promptLabel} />
        </div>
      )}
    </div>
  )

  return (
    <SectionBand block={block}>
      <div className={aside ? 'grid items-start gap-8 lg:grid-cols-[1.35fr_1fr] lg:gap-14' : undefined}>
        <div className="flex min-w-0 flex-col items-start gap-4">
          {label && <p className={eyebrowClass}>{label}</p>}
          <h1 className="max-w-3xl font-serif text-4xl font-bold leading-[1.05] tracking-tight md:text-[3.25rem]">{title}</h1>
          {body.trim() && <p className="max-w-3xl text-lg md:text-[1.1875rem] md:leading-normal">{body}</p>}
          <SectionActions actions={block.actions} className="pt-2" />
        </div>
        {aside || null}
      </div>
    </SectionBand>
  )
}
