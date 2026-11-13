import Link from 'next/link'
import React from 'react'

import { CMSLink } from '@/components/Link'
import { Logo } from '@/components/Logo/Logo'
import { HeaderListen } from '@/components/ListenLive/HeaderListen'
import { HeaderSearch } from '@/components/SiteNav/HeaderSearch'
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
          {buttons.listen && <HeaderListen label={buttons.listen.label} />}
          {buttons.search && <HeaderSearch label={buttons.search.label} />}
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
