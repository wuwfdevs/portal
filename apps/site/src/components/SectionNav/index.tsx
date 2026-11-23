import Link from 'next/link'
import React from 'react'

import type { Tone } from '@/lib/page-themes/themes'
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
 * - only items that lead somewhere: the caller leaves out a link to a part of the page that is not rendered, and a link to a place on this page whose section drew nothing is hidden
 *   when the page loads (`FadeScroller`), so the strip never has a link that goes nowhere.
 *
 * `band` is a band tone (`plain`, `dark`, `teal`...): the strip takes that tone's ground and colours from the page theme, so a theme grounds it (paper for
 * Unearthing, teal for the Voyager, navy for RadioLive). It must sit inside a page theme (`data-page-theme`). The older `tone` (`dark` or `light`) is fixed
 * navy or white for a strip outside a themed page. Server component: no script.
 */
export const SectionNav: React.FC<{
  /** Names the landmark, e.g. "RadioLive". Also shown as the strip's title unless `hideTitle`. */
  label: string
  items: SectionNavItem[]
  /** Where the title links to (the section's home). Without it the title is plain text. */
  homeHref?: string
  tone?: 'dark' | 'light'
  /** A band tone from the page theme; wins over `tone`. */
  band?: Tone
  hideTitle?: boolean
  className?: string
}> = ({ label, items, homeHref, tone = 'light', band, hideTitle, className }) => {
  const dark = tone === 'dark'
  const link = cn(
    'inline-flex min-h-11 items-center whitespace-nowrap border-b-[3px] border-transparent px-3 text-sm font-bold no-underline hover:no-underline',
    band ? '[color:var(--tone-text)] hover:[border-color:var(--tone-muted)]' : dark ? 'text-surface hover:border-surface-dark-text' : 'text-ink hover:border-rule-strong',
  )
  const currentLink = band ? '[border-color:var(--tone-accent)]' : dark ? 'border-wuwf-lime' : 'border-wuwf-blue-700'
  const title = 'font-serif text-2xl font-semibold'
  const titleColor = band ? '[color:var(--tone-text)]' : dark ? 'text-surface' : 'text-ink'

  return (
    <div
      className={cn('border-b', band ? '[border-color:var(--tone-rule)]' : dark ? 'border-surface-dark-line bg-surface-dark text-surface' : 'border-rule bg-surface text-ink', className)}
      data-nav-tone={band}
    >
      <div className="container flex flex-wrap items-center gap-x-6 md:flex-nowrap">
        {!hideTitle && (
          <span className="flex min-h-11 shrink-0 items-center py-1">
            {homeHref ? (
              <Link className={cn(title, 'no-underline hover:no-underline', titleColor)} href={homeHref}>
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
                <li className="shrink-0" data-anchor={item.href.startsWith('#') ? item.href.slice(1) : undefined} key={`${item.href}-${item.label}`}>
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
