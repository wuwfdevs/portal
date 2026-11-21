import Link from 'next/link'
import React from 'react'

import { cn } from '@/utilities/ui'

import { FadeScroller } from './FadeScroller'

export type SectionNavItem = {
  label: string
  /** A page (`/radiolive/artists`) or a place on the page (`#shows`). */
  href: string
  /** The page the reader is on. Set it on page-to-page items only; an in-page `#anchor` has no "current" state. */
  current?: boolean
}

/**
 * The site's standard sub-navigation: the strip under the header that moves a reader around inside one section (a hub like
 * RadioLive). Use this, not a hand-built row of links, so every section behaves the same way:
 *
 * - one real `<nav>` landmark with a list of links, labelled with the section's name;
 * - one line at every width: on a phone the links scroll sideways instead of wrapping into a second and third row, and the
 *   edge with more beyond it fades (`FadeScroller`, the one client piece here), so a cut-off link reads as "scroll for more";
 * - every link is at least 44px tall to touch;
 * - the current page is marked with `aria-current="page"` and an underline, not by colour alone;
 * - only items that lead somewhere: the caller leaves out a link to a part of the page that is not rendered.
 *
 * `tone` picks the surface it sits on (`dark` for the RadioLive look, `light` for a plain page). A section whose masthead is its own
 * design (the Voyager) may keep it; anything else should come through here. Server component: no script.
 */
export const SectionNav: React.FC<{
  /** Names the landmark, e.g. "RadioLive". Also shown as the strip's title unless `hideTitle`. */
  label: string
  items: SectionNavItem[]
  /** Where the title links to (the section's home). Without it the title is plain text. */
  homeHref?: string
  tone?: 'dark' | 'light'
  hideTitle?: boolean
  className?: string
}> = ({ label, items, homeHref, tone = 'light', hideTitle, className }) => {
  const dark = tone === 'dark'
  const link = cn(
    'inline-flex min-h-11 items-center whitespace-nowrap border-b-[3px] border-transparent px-3 text-sm font-bold no-underline hover:no-underline',
    dark ? 'text-surface hover:border-surface-dark-text' : 'text-ink hover:border-rule-strong',
  )
  const currentLink = dark ? 'border-wuwf-lime' : 'border-wuwf-blue-700'
  const title = 'font-serif text-2xl font-semibold'

  return (
    <div className={cn('border-b', dark ? 'border-surface-dark-line bg-surface-dark text-surface' : 'border-rule bg-surface text-ink', className)}>
      <div className="container flex flex-wrap items-center gap-x-6 md:flex-nowrap">
        {!hideTitle && (
          <span className="flex min-h-11 shrink-0 items-center py-1">
            {homeHref ? (
              <Link className={cn(title, 'no-underline hover:no-underline', dark ? 'text-surface' : 'text-ink')} href={homeHref}>
                {label}
              </Link>
            ) : (
              <span className={title}>{label}</span>
            )}
          </span>
        )}
        {items.length > 0 && (
          <FadeScroller
            className="-mx-4 w-[calc(100%+2rem)] overflow-x-auto px-1 [scrollbar-width:none] md:mx-0 md:w-auto md:min-w-0 md:flex-1 md:px-0"
            label={label}
          >
            <ul className="flex">
              {items.map((item) => (
                <li className="shrink-0" key={`${item.href}-${item.label}`}>
                  {item.href.startsWith('#') ? (
                    <a className={link} href={item.href}>
                      {item.label}
                    </a>
                  ) : (
                    <Link aria-current={item.current ? 'page' : undefined} className={cn(link, item.current && currentLink)} href={item.href}>
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </FadeScroller>
        )}
      </div>
    </div>
  )
}
