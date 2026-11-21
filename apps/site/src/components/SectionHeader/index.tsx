import Link from 'next/link'
import React from 'react'

import { Eyebrow, SectionHeading } from '@/components/Kit'
import type { SwatchId } from '@/lib/swatches'
import { cn } from '@/utilities/ui'

export interface SectionHeaderMore {
  href: string
  label: string
}

/**
 * The heading every coded section shares (direction C2): an optional eyebrow (a dot and uppercase words), the title drawn by the Kit's `SectionHeading` (serif 600,
 * with the highlight under the words in the section's swatch), and the section's "more" link at the right of the same row, so the way on to everything is in the header
 * and not at the foot of the content. The title is a link when the section has a page of its own. There is no rule under it: the mark is what sets a heading apart.
 *
 * `swatch` is the section's colour (`sections.swatch`); a section with none, or a place that is not a section (the videos, the podcasts), takes the default. Pass `mark={false}`
 * for a heading that should not be highlighted.
 *
 * Sections built from blocks do not use this: their heading and `more` link are `SectionBand`, which reads the band's tone. A page with its own masthead (a themed show)
 * keeps its own heading.
 */
export function SectionHeader({
  id,
  title,
  href,
  eyebrow,
  more,
  swatch,
  mark = true,
  className,
}: {
  id: string
  title: string
  /** Makes the title a link, e.g. to the section's page. */
  href?: string | null
  eyebrow?: string
  more?: SectionHeaderMore | null
  /** The section's colour: its eyebrow dot and the highlight under its title. */
  swatch?: SwatchId | string | null
  /** False draws the title plain. */
  mark?: boolean
  className?: string
}) {
  const heading = (
    <SectionHeading id={id} mark={mark ? (swatch ?? 'blue') : 'none'}>
      {href ? (
        <Link className="text-ink hover:text-wuwf-blue-700 hover:no-underline" href={href}>
          {title}
        </Link>
      ) : (
        title
      )}
    </SectionHeading>
  )
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-1', className)}>
      {eyebrow ? (
        <div className="flex flex-col gap-2">
          <Eyebrow swatch={swatch}>{eyebrow}</Eyebrow>
          {heading}
        </div>
      ) : (
        heading
      )}
      {more && (
        <Link className="inline-flex min-h-11 items-center text-base font-bold text-wuwf-blue-700 underline" href={more.href}>
          {more.label}
        </Link>
      )}
    </div>
  )
}
