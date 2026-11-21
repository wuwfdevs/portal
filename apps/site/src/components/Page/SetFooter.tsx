import Link from 'next/link'
import React from 'react'

import type { SectionNavItem } from '@/components/SectionNav'
import { givingFooter, sponsorFooter } from '@/lib/page-sets/footer'
import type { PageSetSpec } from '@/lib/page-sets/registry'
import { getCachedGlobal } from '@/utilities/getGlobals'

/**
 * The line a set prints under its last section (the set's `footerLine`). The sponsor set prints the Sponsorship settings' service line, the
 * phone and address of corporate support, and a link to the credit guidelines. Read through `getCachedGlobal`, so saving the settings reaches
 * every page of the set. The giving set prints the Giving settings' service line alone, as the giving pages always did.
 */
export async function SetFooter({ set, items }: { set: PageSetSpec; items: readonly SectionNavItem[] }) {
  if (!set.footerLine) return null
  if (set.id === 'giving') {
    const line = givingFooter(await getCachedGlobal('giving-settings', 0)())
    return line ? (
      <footer className="border-t border-rule bg-surface-2">
        <p className="container py-6 text-sm text-ink-2">{line}</p>
      </footer>
    ) : null
  }
  if (set.id !== 'sponsor') return null
  const settings = await getCachedGlobal('sponsorship-settings', 0)()
  const view = sponsorFooter(settings, items)
  if (!view) return null
  return (
    <footer className="border-t border-rule bg-surface-2 text-ink">
      <div className="container flex flex-col gap-2 py-6 text-sm text-ink-2 md:flex-row md:items-center md:justify-between">
        <p>
          {view.serviceLine}
          {view.phone && (
            <>
              {' '}
              Corporate support:{' '}
              {view.phone.href ? (
                <a className="font-bold text-wuwf-blue-700 underline" href={view.phone.href}>
                  {view.phone.text}
                </a>
              ) : (
                view.phone.text
              )}
            </>
          )}
          {view.address && <> · {view.address}</>}
        </p>
        {view.link && (
          <Link className="inline-flex min-h-11 items-center font-bold text-wuwf-blue-700 underline" href={view.link.href}>
            {view.link.label}
          </Link>
        )}
      </div>
    </footer>
  )
}
