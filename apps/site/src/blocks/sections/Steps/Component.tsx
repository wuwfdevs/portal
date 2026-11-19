import React from 'react'

import { SectionBand, SectionHeading } from '../SectionBand'
import type { SectionData, SectionProps } from '../types'

export interface StepsData extends SectionData {
  steps?: Array<{ id?: string | null; title?: string | null; text?: string | null } | null> | null
}

/** Steps. A step needs its title. The numbers come from the order, in a real ordered list. */
export function StepsSection({ block }: SectionProps<StepsData>) {
  const rows = (block.steps ?? []).filter((s): s is NonNullable<typeof s> => Boolean(s?.title?.trim()))
  if (rows.length === 0) return null
  const list = block.variant === 'list'
  return (
    <SectionBand block={block}>
      <SectionHeading heading={block.heading} />
      {list ? (
        <ol className="flex max-w-3xl list-none flex-col gap-4 p-0">
          {rows.map((s, i) => (
            <li className="flex gap-4" key={s.id ?? `${s.title}-${i}`}>
              <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold [border-color:currentColor]">
                {i + 1}
              </span>
              <span className="flex flex-col">
                <strong className="text-lg">{s.title}</strong>
                {s.text?.trim() && <span>{s.text}</span>}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <ol className="grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
          {rows.map((s, i) => (
            <li className="flex flex-col gap-2 border-t-4 pt-4 [border-color:var(--tone-rule)]" key={s.id ?? `${s.title}-${i}`}>
              <span aria-hidden="true" className="font-serif text-5xl font-bold leading-none">
                {i + 1}
              </span>
              <strong className="text-lg">{s.title}</strong>
              {s.text?.trim() && <span>{s.text}</span>}
            </li>
          ))}
        </ol>
      )}
    </SectionBand>
  )
}
