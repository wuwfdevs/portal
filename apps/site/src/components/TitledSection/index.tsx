import React from 'react'

import { SectionHeader, type SectionHeaderMore } from '@/components/SectionHeader'
import type { SwatchId } from '@/lib/swatches'

/**
 * A titled section of a page: the landmark, the shared header (`SectionHeader`, which draws the title through the Kit's `SectionHeading`: eyebrow, title with its swatch's mark, the "more" link in the header) and
 * the content under it at the one gap every section uses. The home page's news runs, its short-video row and the video strip on a section page
 * are all this with different content, so they stay the same shape without each repeating it. Content is the caller's.
 */
export function TitledSection({
  id,
  title,
  href,
  eyebrow,
  more,
  swatch,
  className,
  children,
}: {
  /** The heading's id; the section is labelled by it. */
  id: string
  title: string
  href?: string | null
  eyebrow?: string
  more?: SectionHeaderMore | null
  /** The section's colour, the mark under its title. */
  swatch?: SwatchId | string | null
  className?: string
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className={className}>
      <SectionHeader eyebrow={eyebrow} href={href} id={id} more={more} swatch={swatch} title={title} />
      <div className="mt-6">{children}</div>
    </section>
  )
}
