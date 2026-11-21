import React from 'react'

import { DESKS, deskOf, type DeskId } from '@/lib/desks'
import { cn } from '@/utilities/ui'

import { Eyebrow } from './Eyebrow'

/**
 * A desk's name as a chip. `pill` is the tint with the desk's text (also the caption on a picture); `dot` is the round dot and the
 * name, as an eyebrow does. `label` replaces the desk's own name (a section's title). A desk the code does not know is News.
 */
export function DeskChip({ desk, label, variant = 'pill', className }: { desk?: DeskId | string | null; label?: string | null; variant?: 'pill' | 'dot'; className?: string }) {
  const id = deskOf(desk)
  const style = DESKS[id]
  const text = label?.trim() || style.label
  if (variant === 'dot') return <Eyebrow className={className} desk={id}>{text}</Eyebrow>
  return (
    <span className={cn('inline-flex min-h-[26px] items-center rounded-pill px-2.5 text-[0.6875rem] font-bold uppercase tracking-[0.05em]', style.tint, style.chipText, className)}>
      {text}
    </span>
  )
}

/** A round badge with a serif number, tinted by the desk: the Briefing's list, a ranked list. */
export function NumberBadge({ n, desk, className }: { n: number | string; desk?: DeskId | string | null; className?: string }) {
  const style = DESKS[deskOf(desk)]
  return (
    <span aria-hidden="true" className={cn('flex size-[30px] shrink-0 items-center justify-center rounded-pill font-serif text-[0.9375rem] font-bold', style.tint, style.chipText, className)}>
      {n}
    </span>
  )
}
