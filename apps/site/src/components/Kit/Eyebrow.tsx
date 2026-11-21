import React from 'react'

import { DESKS, deskOf, type DeskId } from '@/lib/desks'
import { cn } from '@/utilities/ui'

/** The type of an eyebrow, with no colour or layout: the constants that draw a text-only label (`PageParts`, `Listening/styles`, the sections' `eyebrowClass`) share it. */
export const eyebrowLabel = 'text-xs font-bold uppercase tracking-[0.08em]'

/** An eyebrow that carries a dot: the type, in a row. Colour is added by the caller (a desk's text, or the band's accent). */
export const eyebrowText = `inline-flex items-center gap-2 ${eyebrowLabel}`

/**
 * The small label above a heading: a round dot and uppercase words. The colour is a desk's (`desk`), or, inside a section band, the
 * band's accent (`tone`), so one eyebrow is right on every ground. With neither it is News.
 */
export function Eyebrow({ children, desk, tone = false, className }: { children?: React.ReactNode; desk?: DeskId | string | null; tone?: boolean; className?: string }) {
  const d = DESKS[deskOf(desk)]
  return (
    <span className={cn(eyebrowText, tone ? '[color:var(--tone-accent)]' : d.text, className)}>
      <span aria-hidden="true" className={cn('size-[9px] shrink-0 rounded-pill', tone ? '[background-color:var(--tone-accent)]' : d.dot)} />
      {children}
    </span>
  )
}
