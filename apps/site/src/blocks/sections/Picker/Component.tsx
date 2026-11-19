import React from 'react'

import { cn } from '@/utilities/ui'

import { SectionBand, SectionHeading } from '../SectionBand'
import { SectionActions } from '../parts'
import type { SectionData, SectionProps } from '../types'
import { PICKER_MAX_OPTIONS } from './config'

export interface PickerOption {
  id?: string | null
  label?: string | null
  hint?: string | null
  title?: string | null
  lead?: string | null
  points?: string | null
  price?: string | null
  linkLabel?: string | null
  linkHref?: string | null
}
export interface PickerData extends SectionData {
  options?: Array<PickerOption | null> | null
}

/**
 * The price a panel shows. SEAM: today the typed text; when a panel refers to a price in the sponsorship settings (open question,
 * PAGE-BLOCKS.md → Block catalogue) this is the one place that resolves it.
 */
export function priceOf(option: PickerOption): string | null {
  return option.price?.trim() || null
}

/** A textarea of one line each, as a list: blank lines and surrounding space dropped. */
export function linesOf(value: string | null | undefined): string[] {
  return (value ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
}

// Tailwind finds a class only when it is written out whole, so every option's peer name is spelled here, up to the most options a picker takes.
const SHOW = ['peer-checked/p0:flex', 'peer-checked/p1:flex', 'peer-checked/p2:flex', 'peer-checked/p3:flex', 'peer-checked/p4:flex', 'peer-checked/p5:flex', 'peer-checked/p6:flex', 'peer-checked/p7:flex']
const CHOSEN = [
  'peer-checked/p0:border-[3px] peer-checked/p0:font-bold',
  'peer-checked/p1:border-[3px] peer-checked/p1:font-bold',
  'peer-checked/p2:border-[3px] peer-checked/p2:font-bold',
  'peer-checked/p3:border-[3px] peer-checked/p3:font-bold',
  'peer-checked/p4:border-[3px] peer-checked/p4:font-bold',
  'peer-checked/p5:border-[3px] peer-checked/p5:font-bold',
  'peer-checked/p6:border-[3px] peer-checked/p6:font-bold',
  'peer-checked/p7:border-[3px] peer-checked/p7:font-bold',
]
const FOCUS = [
  'peer-focus-visible/p0:outline',
  'peer-focus-visible/p1:outline',
  'peer-focus-visible/p2:outline',
  'peer-focus-visible/p3:outline',
  'peer-focus-visible/p4:outline',
  'peer-focus-visible/p5:outline',
  'peer-focus-visible/p6:outline',
  'peer-focus-visible/p7:outline',
]

/**
 * Picker. Real radio buttons (so it works without script and by keyboard) and a panel for each option; the checked option's panel shows
 * by a CSS peer rule. A choice needs its name and its panel a title; draws nothing with fewer than two choices (one is not a choice).
 */
export function PickerSection({ block }: SectionProps<PickerData>) {
  const options = (block.options ?? []).filter((o): o is PickerOption => Boolean(o?.label?.trim() && o.title?.trim())).slice(0, PICKER_MAX_OPTIONS)
  if (options.length < 2) return null
  const key = `picker-${block.id ?? block.anchor ?? 'x'}`
  return (
    <SectionBand block={block}>
      <SectionHeading heading={block.heading} />
      {/* Inputs, choices and panels are siblings in one group, so a checked input's CSS peer rule reaches the choice and the panel after it. */}
      <div aria-label={block.heading?.title?.trim() || 'Choose one'} className="flex flex-wrap gap-3" role="radiogroup">
        {options.map((o, i) => (
          <input className={`peer/p${i} sr-only`} defaultChecked={i === 0} id={`${key}-${i}`} key={`in-${o.id ?? i}`} name={key} type="radio" value={String(i)} />
        ))}
        {options.map((o, i) => (
          <label
            className={cn('flex min-h-14 cursor-pointer flex-col justify-center rounded-sm border px-5 py-2 [border-color:currentColor] outline-offset-2', CHOSEN[i], FOCUS[i])}
            htmlFor={`${key}-${i}`}
            key={`lb-${o.id ?? i}`}
          >
            <span className="text-base">{o.label}</span>
            {o.hint?.trim() && <span className="text-sm font-normal [color:var(--tone-muted)]">{o.hint}</span>}
          </label>
        ))}
        {options.map((o, i) => {
          const points = linesOf(o.points)
          const price = priceOf(o)
          return (
            <div className={cn('mt-3 hidden basis-full flex-col border-t-4 pt-4 [border-color:var(--tone-rule)]', SHOW[i])} data-panel={i} key={`pn-${o.id ?? i}`}>
              <div className="flex max-w-3xl flex-col gap-3">
              <h3 className="font-serif text-2xl font-bold">{o.title}</h3>
              {o.lead?.trim() && <p className="text-lg">{o.lead}</p>}
              {points.length > 0 && (
                <ul className="flex list-disc flex-col gap-1 pl-6">
                  {points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              {price && <p className="text-lg font-bold">{price}</p>}
              <SectionActions actions={[{ label: o.linkLabel, href: o.linkHref }]} />
              </div>
            </div>
          )
        })}
      </div>
    </SectionBand>
  )
}
