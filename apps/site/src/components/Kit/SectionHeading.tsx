import React from 'react'

import { SWATCHES, swatchOf, type SwatchId } from '@/lib/swatches'
import { cn } from '@/utilities/ui'

/** Where the highlight under a heading gets its colour: a swatch's, the band's own mark (`tone`, set by the page theme), or none. */
export type HeadingMark = SwatchId | 'tone' | 'none'

const sizes = { xl: 'text-[2.5rem] leading-[1.1]', lg: 'text-3xl leading-tight', md: 'text-[1.375rem] leading-tight' } as const
export type HeadingSize = keyof typeof sizes

/** The heading's class: serif at weight 600. The size is one of three; `as` and `id` are the caller's. */
export const headingClasses = (size: HeadingSize = 'lg') => cn('font-serif font-semibold text-ink', sizes[size])

/**
 * A section's heading (direction C2): serif at 600, with an optional highlight under the words, a `<span class="mark">` whose colour
 * is the `--mk` property (a swatch's, or the band's `--tone-mark`). Without a mark it is the plain heading. It draws the heading
 * element only; the row it sits in (a "more" link at the right, a rule) is the caller's, as `components/SectionHeader` and
 * `SectionBand` do.
 */
export function SectionHeading({
  children,
  as: Tag = 'h2',
  id,
  mark = 'none',
  size = 'lg',
  className,
}: {
  children?: React.ReactNode
  as?: 'h1' | 'h2' | 'h3'
  id?: string
  mark?: HeadingMark | string | null
  size?: HeadingSize
  className?: string
}) {
  const markClass = mark === 'tone' ? '[--mk:var(--tone-mark)]' : mark && mark !== 'none' ? SWATCHES[swatchOf(mark)].mark : null
  return (
    <Tag className={cn(headingClasses(size), className)} id={id}>
      {markClass ? <span className={cn('mark', markClass)}>{children}</span> : children}
    </Tag>
  )
}
