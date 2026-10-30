import Link from 'next/link'
import React from 'react'

import { CMSLink } from '@/components/Link'
import { Logo } from '@/components/Logo/Logo'
import { getCachedGlobal } from '@/utilities/getGlobals'

/**
 * The site footer. Columns and the legal row are the Footer global's; only the station's identity line is fixed.
 */
export async function Footer() {
  const footer = await getCachedGlobal('footer', 1)()
  const columns = footer?.columns ?? []
  const legal = footer?.navItems ?? []

  return (
    <footer className="mt-auto bg-surface-dark text-surface-dark-text">
      <div className="container flex flex-col gap-10 py-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:justify-between">
          <div className="flex max-w-sm flex-col gap-3">
            <Link aria-label="WUWF Public Media home" href="/">
              <Logo className="h-10" />
            </Link>
            <p className="font-serif text-lg text-surface">NPR for Florida&apos;s Great Northwest.</p>
            <p className="text-sm">A service of the University of West Florida.</p>
            <p className="text-sm">11000 University Parkway · Pensacola, FL 32514 · 850 474-2787</p>
          </div>

          {columns.length > 0 && (
            <nav aria-label="Footer" className="grid flex-1 grid-cols-2 gap-8 md:grid-cols-4 lg:max-w-3xl">
              {columns.map((column) => (
                <div className="flex flex-col gap-2" key={column.id ?? column.heading}>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-surface">{column.heading}</h2>
                  <ul className="flex flex-col">
                    {(column.links ?? []).map(({ link, id }) => (
                      <li key={id ?? link.label}>
                        <CMSLink className="inline-flex min-h-11 items-center text-sm text-surface-dark-text hover:text-surface" {...link} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-surface-dark-line pt-6 text-sm md:flex-row md:justify-between">
          <p>© {new Date().getFullYear()} WUWF Public Media</p>
          {legal.length > 0 && (
            <ul className="flex flex-wrap gap-x-5">
              {legal.map(({ link, id }) => (
                <li key={id ?? link.label}>
                  <CMSLink className="inline-flex min-h-11 items-center text-surface-dark-text hover:text-surface" {...link} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </footer>
  )
}
