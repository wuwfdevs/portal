import Link from 'next/link'
import React from 'react'

import { cn } from '@/utilities/ui'

export interface SectionHeaderMore {
  href: string
  label: string
}

/**
 * The heading every coded home-page section shares: an optional small blue label, a serif title (a link when the section has a page of its own),
 * and the section's "more" link at the right of the same row, so the way on to everything is in the header and not at the foot of the content.
 * The ruled variant (the default) is the news column's heavy rule under the heading; `rule={false}` is for a section inside its own band,
 * where the band already sets it apart (the podcasts).
 *
 * Sections built from blocks do not use this: their heading and `more` link are `SectionBand`, which reads the band's tone. A page with its own
 * masthead (a themed show) keeps its own heading.
 */
export function SectionHeader({
  id,
  title,
  href,
  eyebrow,
  more,
  rule = true,
  className,
}: {
  id: string
  title: string
  /** Makes the title a link, e.g. to the section's page. */
  href?: string | null
  eyebrow?: string
  more?: SectionHeaderMore | null
  rule?: boolean
  className?: string
}) {
  const heading = (
    <h2 className={cn('font-serif text-3xl font-bold leading-tight text-ink', eyebrow && 'mt-1')} id={id}>
      {href ? (
        <Link className="text-ink hover:text-wuwf-blue-700 hover:no-underline" href={href}>
          {title}
        </Link>
      ) : (
        title
      )}
    </h2>
  )
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-1', rule && 'border-b-2 border-ink pb-2', className)}>
      {eyebrow ? (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-wuwf-blue-700">{eyebrow}</p>
          {heading}
        </div>
      ) : (
        heading
      )}
      {more && (
        <Link className="inline-flex min-h-11 items-center text-base font-semibold text-wuwf-blue-700 underline" href={more.href}>
          {more.label}
        </Link>
      )}
    </div>
  )
}
