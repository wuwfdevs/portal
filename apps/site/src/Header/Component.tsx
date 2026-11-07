import Link from 'next/link'
import React from 'react'

import { CMSLink } from '@/components/Link'
import { Logo } from '@/components/Logo/Logo'
import { MenuBar } from '@/components/SiteNav/MenuBar'
import { supabaseAuthConfig } from '@/lib/audience/supabase'
import { liveChannels } from '@/lib/live/channels'
import { drawableItems, headerButtons } from '@/lib/nav/header'
import { getCachedGlobal } from '@/utilities/getGlobals'

/**
 * The site header (boards 27 and 27b). Everything after the logo comes from the Header global: the items across the
 * top (links and menus, in the editors' order), the buttons on the right (shown, hidden, relabelled) and the optional
 * second row. Listen live shows while the Listen live settings have a channel (board 26).
 */
export async function Header() {
  const header = await getCachedGlobal('header', 1)()
  const items = drawableItems(header?.navItems)
  const sections = header?.sections ?? []
  const listen = await getCachedGlobal('listen-live', 0)().catch(() => null)
  const buttons = headerButtons(header?.actions, supabaseAuthConfig() !== null, liveChannels(listen?.channels).length > 0)

  return (
    <header className="relative border-b border-rule bg-surface">
      <div className="container flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 py-1 lg:flex-nowrap lg:gap-x-6">
        <Link aria-label="WUWF Public Media home" className="shrink-0" href="/">
          <Logo priority />
        </Link>

        {items.length > 0 && <MenuBar items={items} />}

        <div className="ml-auto flex items-center gap-1">
          {buttons.listen && (
            <Link className="inline-flex min-h-11 items-center gap-2 px-1 text-base font-bold text-ink hover:text-wuwf-blue-700" href="/listen">
              <span aria-hidden="true" className="size-2.5 rounded-full bg-on-air-red" />
              {buttons.listen.label}
            </Link>
          )}
          {buttons.search && (
            <Link aria-label={buttons.search.label} className="flex size-11 items-center justify-center rounded-sm text-ink hover:bg-surface-2" href="/search">
              <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" width="20">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-4-4" />
              </svg>
            </Link>
          )}
          {buttons.signIn && (
            <Link className="hidden min-h-11 items-center px-1 text-base font-semibold text-ink-2 hover:text-wuwf-blue-700 sm:inline-flex" href="/account">
              {buttons.signIn.label}
            </Link>
          )}
          {buttons.donate && (
            <Link
              className="inline-flex min-h-11 items-center rounded-sm bg-wuwf-blue-700 px-4 text-base font-bold text-surface hover:bg-wuwf-blue-600 hover:no-underline"
              href={buttons.donate.href}
            >
              {buttons.donate.label}
            </Link>
          )}
        </div>
      </div>

      {sections.length > 0 && (
        <nav aria-label="Sections" className="border-t border-rule">
          <div className="container flex gap-5 overflow-x-auto whitespace-nowrap">
            {sections.map(({ link, id }) => (
              <CMSLink
                className="inline-flex min-h-11 items-center text-sm font-bold text-ink-2 hover:text-wuwf-blue-700"
                key={id ?? link.label}
                {...link}
              />
            ))}
          </div>
        </nav>
      )}
    </header>
  )
}
