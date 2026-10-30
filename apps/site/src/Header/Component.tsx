import Link from 'next/link'
import React from 'react'

import { CMSLink } from '@/components/Link'
import { Logo } from '@/components/Logo/Logo'
import { MobileMenu } from '@/components/SiteNav/MobileMenu'
import { getCachedGlobal } from '@/utilities/getGlobals'

const primaryLink = 'inline-flex min-h-11 items-center text-base font-semibold text-ink hover:text-wuwf-blue-700'

/**
 * The site header. Its links are the Header global's (editors change them in the admin); nothing is listed here.
 * Row one is the primary navigation; row two is the editor-curated sections (a fellowship, a series, a topic).
 */
export async function Header() {
  const header = await getCachedGlobal('header', 1)()
  const nav = header?.navItems ?? []
  const sections = header?.sections ?? []

  return (
    <header className="border-b border-rule bg-surface">
      <div className="container flex min-h-16 items-center gap-6">
        <Link aria-label="WUWF Public Media home" className="shrink-0" href="/">
          <Logo priority />
        </Link>

        <nav aria-label="Primary" className="hidden flex-1 flex-wrap gap-x-5 lg:flex">
          {nav.map(({ link, id }) => (
            <CMSLink className={primaryLink} key={id ?? link.label} {...link} />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Link
            className="inline-flex min-h-11 items-center rounded-sm bg-wuwf-blue-700 px-4 text-base font-bold text-surface hover:bg-wuwf-blue-600 hover:no-underline"
            href="/support"
          >
            Donate
          </Link>
          <MobileMenu>
            <nav aria-label="Primary" className="flex flex-col">
              {nav.map(({ link, id }) => (
                <CMSLink className={`${primaryLink} px-3`} key={id ?? link.label} {...link} />
              ))}
            </nav>
          </MobileMenu>
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
