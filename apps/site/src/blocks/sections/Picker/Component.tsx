import React from 'react'

import { cn } from '@/utilities/ui'

import { SectionBand } from '../SectionBand'
import { SectionActions } from '../parts'
import type { SectionData, SectionProps } from '../types'
import { PICKER_MAX_OPTIONS } from './config'

export interface PickerLine {
  id?: string | null
  label?: string | null
  name?: string | null
  detail?: string | null
  price?: string | null
}
export interface PickerOption {
  id?: string | null
  label?: string | null
  hint?: string | null
  title?: string | null
  lead?: string | null
  points?: string | null
  totalLabel?: string | null
  total?: string | null
  span?: string | null
  lines?: Array<PickerLine | null> | null
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
  'peer-checked/p0:[background-color:var(--tone-text)] peer-checked/p0:[border-color:var(--tone-text)] peer-checked/p0:[color:var(--tone-ground)]',
  'peer-checked/p1:[background-color:var(--tone-text)] peer-checked/p1:[border-color:var(--tone-text)] peer-checked/p1:[color:var(--tone-ground)]',
  'peer-checked/p2:[background-color:var(--tone-text)] peer-checked/p2:[border-color:var(--tone-text)] peer-checked/p2:[color:var(--tone-ground)]',
  'peer-checked/p3:[background-color:var(--tone-text)] peer-checked/p3:[border-color:var(--tone-text)] peer-checked/p3:[color:var(--tone-ground)]',
  'peer-checked/p4:[background-color:var(--tone-text)] peer-checked/p4:[border-color:var(--tone-text)] peer-checked/p4:[color:var(--tone-ground)]',
  'peer-checked/p5:[background-color:var(--tone-text)] peer-checked/p5:[border-color:var(--tone-text)] peer-checked/p5:[color:var(--tone-ground)]',
  'peer-checked/p6:[background-color:var(--tone-text)] peer-checked/p6:[border-color:var(--tone-text)] peer-checked/p6:[color:var(--tone-ground)]',
  'peer-checked/p7:[background-color:var(--tone-text)] peer-checked/p7:[border-color:var(--tone-text)] peer-checked/p7:[color:var(--tone-ground)]',
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
    <SectionBand block={block} heading={block.heading}>
      {/* Inputs, choices and panels are siblings in one group, so a checked input's CSS peer rule reaches the choice and the panel after it. */}
      <div aria-label={block.heading?.title?.trim() || 'Choose one'} className="flex flex-wrap gap-3" role="radiogroup">
        {options.map((o, i) => (
          <input className={`peer/p${i} sr-only`} defaultChecked={i === 0} id={`${key}-${i}`} key={`in-${o.id ?? i}`} name={key} type="radio" value={String(i)} />
        ))}
        {options.map((o, i) => (
          <label
            className={cn('flex min-h-11 cursor-pointer flex-col justify-center rounded-full border-[1.5px] px-4 py-1.5 font-bold outline-offset-2 [background-color:var(--tone-card)] [border-color:var(--tone-card-rule)]', CHOSEN[i], FOCUS[i])}
            htmlFor={`${key}-${i}`}
            key={`lb-${o.id ?? i}`}
          >
            <span className="text-sm">{o.label}</span>
            {o.hint?.trim() && <span className="text-sm font-normal [color:var(--tone-muted)]">{o.hint}</span>}
          </label>
        ))}
        {options.map((o, i) => {
          const points = linesOf(o.points)
          const price = priceOf(o)
          const lines = (o.lines ?? []).filter((l): l is PickerLine => Boolean(l?.name?.trim()))
          return (
            <div className={cn('mt-3 hidden basis-full', SHOW[i])} data-panel={i} key={`pn-${o.id ?? i}`}>
              <div className={cn('grid w-full gap-6 rounded-lg border p-6 md:p-8 [background-color:var(--tone-card)] [border-color:var(--tone-card-rule)]', lines.length > 0 && 'lg:grid-cols-[1fr_1.2fr] lg:gap-10')}>
                <div className="flex max-w-3xl flex-col gap-3">
                  <h3 className="font-serif text-2xl font-bold leading-tight md:text-3xl">{o.title}</h3>
                  {o.lead?.trim() && <p className="text-base [color:var(--tone-muted)]">{o.lead}</p>}
                  {o.total?.trim() && (
                    <div className="mt-2 flex flex-col gap-1 rounded-sm p-4 [background-color:var(--tone-tint)]">
                      {o.totalLabel?.trim() && <span className="text-xs font-bold uppercase tracking-[0.08em] [color:var(--tone-muted)]">{o.totalLabel}</span>}
                      <strong className="font-serif text-4xl font-bold leading-none">{o.total}</strong>
                      {o.span?.trim() && <span className="text-sm [color:var(--tone-muted)]">{o.span}</span>}
                    </div>
                  )}
                  {points.length > 0 && (
                    <ul className="flex list-disc flex-col gap-1 pl-6">
                      {points.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  )}
                  {price && !o.total?.trim() && <p className="text-lg font-bold">{price}</p>}
                  <SectionActions actions={[{ label: o.linkLabel, href: o.linkHref }]} className="pt-2" />
                </div>
                {lines.length > 0 && (
                  <ul className="m-0 flex list-none flex-col p-0">
                    {lines.map((l, n) => (
                      <li className="flex flex-col gap-1 border-t py-4 first:border-t-0 first:pt-0 sm:flex-row sm:justify-between sm:gap-6 [border-color:var(--tone-card-rule)]" key={l.id ?? `${l.name}-${n}`}>
                        <div className="flex flex-col">
                          {l.label?.trim() && <span className="text-xs font-bold uppercase tracking-[0.08em] [color:var(--tone-accent)]">{l.label}</span>}
                          <strong className="text-lg">{l.name}</strong>
                          {l.detail?.trim() && <span className="text-sm [color:var(--tone-muted)]">{l.detail}</span>}
                        </div>
                        {l.price?.trim() && <strong className="shrink-0 text-base sm:text-right">{l.price}</strong>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </SectionBand>
  )
}
