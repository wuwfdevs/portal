import Link from 'next/link'
import React from 'react'

import { cn } from '@/utilities/ui'

import { t } from './styles'

/**
 * The membership band at the foot of a themed show's pages (boards 21, 23): supporting the show is supporting the
 * station. It links to the show's support page; it states nothing about member feeds, which are not built yet.
 */
export function MembershipBand({ showTitle, showPath, heading, intro }: { showTitle: string; showPath: string; heading?: string | null; intro?: string | null }) {
  return (
    <section aria-labelledby="membership-band-heading" className={cn('mt-20 border-y', t.rule)}>
      <div className={cn(t.container, 'flex flex-col gap-5 py-14 md:flex-row md:items-end md:justify-between')}>
        <div className="flex max-w-[44rem] flex-col gap-3">
          <p className={t.eyebrow}>Support {showTitle}</p>
          <h2 className={cn(t.display, 'text-4xl md:text-5xl')} id="membership-band-heading">
            {heading || 'Become a WUWF member'}
          </h2>
          <p className={cn('text-lg italic leading-relaxed', t.muted)}>
            {intro || `${showTitle} is a production of WUWF Public Media. The way to support the show is the way to support the station: a sustaining membership, a tax-deductible gift to WUWF.`}
          </p>
        </div>
        <Link className={cn(t.primary, 'shrink-0')} href={`${showPath}/support`}>
          Support the show
        </Link>
      </div>
    </section>
  )
}
