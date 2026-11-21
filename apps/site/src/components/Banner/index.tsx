import Link from 'next/link'
import React from 'react'

import type { BannerData, BannerStyle } from '@/lib/banner'
import { isInternalHref } from '@/lib/section-links'
import { cn } from '@/utilities/ui'

/** What each style looks like. Emergency is the strong band the home page has always had; a notice is quiet, for news that is not urgent. */
const LOOK: Record<BannerStyle, { band: string; label: string; button: string }> = {
  emergency: {
    band: 'border-b-4 border-wuwf-blue-700 bg-wuwf-blue-100',
    label: 'text-wuwf-blue-700',
    button: 'bg-wuwf-blue-700 text-surface hover:bg-wuwf-blue-600',
  },
  notice: {
    band: 'border-b border-rule bg-surface-2',
    label: 'text-ink-3',
    button: 'border-2 border-wuwf-blue-700 text-wuwf-blue-700 hover:bg-surface',
  },
}

/**
 * The site banner (`lib/banner`): a label, a headline, a sentence or two and one link, across the top of the page. The home page draws the
 * banners meant for it inside the page; the layout draws the ones meant for every page, between the header and the page. Draws nothing without one.
 */
export function Banner({ banner }: { banner: BannerData | null }) {
  if (!banner) return null
  const look = LOOK[banner.style]
  const buttonClass = cn('inline-flex min-h-12 shrink-0 items-center justify-center rounded-sm px-6 text-base font-bold hover:no-underline', look.button)
  return (
    <section aria-label={banner.label} className={look.band} data-banner={banner.style}>
      <div className="container flex flex-col gap-2 py-5 md:flex-row md:items-center md:justify-between md:gap-8">
        <div className="flex flex-col gap-1">
          <p className={cn('text-xs font-bold uppercase tracking-widest', look.label)}>{banner.label}</p>
          <h2 className="font-serif text-2xl font-bold leading-snug text-ink">{banner.headline}</h2>
          {banner.body && <p className="max-w-[44rem] text-base text-ink-2">{banner.body}</p>}
        </div>
        {banner.linkHref &&
          (isInternalHref(banner.linkHref) ? (
            <Link className={buttonClass} href={banner.linkHref}>
              {banner.linkLabel}
            </Link>
          ) : (
            <a className={buttonClass} href={banner.linkHref} rel="noopener noreferrer">
              {banner.linkLabel}
            </a>
          ))}
      </div>
    </section>
  )
}
