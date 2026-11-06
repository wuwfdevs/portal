import Link from 'next/link'
import React from 'react'

import type { ShowTheme } from '@/lib/shows/themes'
import { showThemeCss } from '@/lib/shows/themes'
import { cn } from '@/utilities/ui'

import { leagueGothic, lora } from './fonts'
import { t } from './styles'

export type ShowSection = 'home' | 'episode' | 'field-notes' | 'archive' | 'support'

/**
 * The frame of a themed show's pages (boards 21-24): the show's tokens, its faces and its own navigation band, under the
 * station's header. The board's navy "A WUWF original" strip, which replaces the station header, is not built: it needs the
 * site's layout split so a show can drop the header (ROADMAP → Phase 7).
 */
export function ThemedShell({
  theme,
  showTitle,
  showPath,
  current,
  hasFieldNotes,
  hasArchive,
  children,
}: {
  theme: ShowTheme
  showTitle: string
  showPath: string
  current: ShowSection
  hasFieldNotes: boolean
  hasArchive: boolean
  children: React.ReactNode
}) {
  const links: { href: string; label: string; section?: ShowSection }[] = [
    { href: `${showPath}#episodes`, label: 'Episodes' },
    ...(hasFieldNotes ? [{ href: `${showPath}/field-notes`, label: 'Field Notes', section: 'field-notes' as const }] : []),
    ...(hasArchive ? [{ href: `${showPath}/archive`, label: 'The Archive', section: 'archive' as const }] : []),
    { href: `${showPath}#about`, label: 'About' },
  ]
  return (
    <div className={cn(leagueGothic.variable, lora.variable, t.page, 'min-h-screen pb-20')} data-show-theme={theme.id}>
      {/* The theme's tokens, generated from code (never from the CMS), as text: no markup is injected. */}
      <style>{showThemeCss(theme)}</style>
      <nav aria-label={`${showTitle} sections`} className="border-b border-(--color-show-rule)">
        <div className={cn(t.container, 'flex flex-wrap items-center gap-x-6 gap-y-1 py-3')}>
          <Link className={cn(t.display, 'mr-auto text-2xl text-(--color-show-text) hover:text-(--color-show-accent) hover:no-underline')} href={showPath}>
            {showTitle}
          </Link>
          {links.map((l) => (
            <Link
              aria-current={l.section && l.section === current ? 'page' : undefined}
              className={cn(t.label, 'inline-flex min-h-11 items-center text-base text-(--color-show-muted) hover:text-(--color-show-accent) hover:no-underline aria-[current=page]:text-(--color-show-accent)')}
              href={l.href}
              key={l.href}
            >
              {l.label}
            </Link>
          ))}
          <Link
            aria-current={current === 'support' ? 'page' : undefined}
            className={cn(t.label, 'inline-flex min-h-11 items-center border border-(--color-show-accent) px-4 text-base text-(--color-show-accent) hover:bg-(--color-show-accent) hover:text-(--color-show-on-accent) hover:no-underline')}
            href={`${showPath}/support`}
          >
            Support the show
          </Link>
        </div>
      </nav>
      {children}
    </div>
  )
}
