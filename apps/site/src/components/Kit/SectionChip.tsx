import React from 'react'

import { SWATCHES, swatchOf, type SwatchId } from '@/lib/swatches'
import { cn } from '@/utilities/ui'

import { Eyebrow } from './Eyebrow'

/**
 * A section's name as a chip, coloured by its swatch. `pill` is the tint with dark text (also the caption on a picture); `dot` is the
 * round dot and the name, as an eyebrow does. The words are the caller's (the section's title); with none, nothing is drawn. A swatch the
 * code does not know is the default.
 */
export function SectionChip({ swatch, label, variant = 'pill', className }: { swatch?: SwatchId | string | null; label: string | null | undefined; variant?: 'pill' | 'dot'; className?: string }) {
  const text = label?.trim()
  if (!text) return null
  const style = SWATCHES[swatchOf(swatch)]
  if (variant === 'dot') return <Eyebrow className={className} swatch={swatch}>{text}</Eyebrow>
  return (
    <span className={cn('inline-flex min-h-[26px] items-center rounded-pill px-2.5 text-[0.6875rem] font-bold uppercase tracking-[0.05em]', style.tint, style.chipText, className)}>
      {text}
    </span>
  )
}

/** A round badge with a serif number, tinted by the swatch: the Briefing's list, a ranked list. */
export function NumberBadge({ n, swatch, className }: { n: number | string; swatch?: SwatchId | string | null; className?: string }) {
  const style = SWATCHES[swatchOf(swatch)]
  return (
    <span aria-hidden="true" className={cn('flex size-[30px] shrink-0 items-center justify-center rounded-pill font-serif text-[0.9375rem] font-bold', style.tint, style.chipText, className)}>
      {n}
    </span>
  )
}
