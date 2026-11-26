import type { NextConfig } from 'next'

import { trailingSlashRedirect } from './src/lib/analytics/posthog-config'
import { legacyGivingRedirects } from './src/lib/giving/legacy-addresses'

export const redirects: NextConfig['redirects'] = async () => {
  const internetExplorerRedirect = {
    destination: '/ie-incompatible.html',
    has: [
      {
        type: 'header' as const,
        key: 'user-agent',
        value: '(.*Trident.*)', // all ie browsers
      },
    ],
    permanent: false,
    source: '/:path((?!ie-incompatible.html$).*)', // all pages except the incompatibility page
  }

  // Grove's giving pages (donation, membership levels, legacy, real estate) go to their pages on this site: the list, and why each goes where it does,
  // is `src/lib/giving/legacy-addresses.ts`. Grove's donation page is a temporary redirect (307) so it can be pointed at the donation form later.
  // These run before any page, so an imported page at one of these addresses would never be shown: the importer should skip them.
  const givingRedirects = legacyGivingRedirects()

  // The starter template's list of posts (titles only) is gone: `/latest` lists every story. Page 1 of the old list is the plain address
  // (`/latest/page/1` does not exist), and the old paging addresses keep their page number.
  const postsRedirects = [
    { source: '/posts', destination: '/latest', permanent: true },
    { source: '/posts/page/1', destination: '/latest', permanent: true },
    { source: '/posts/page/:pageNumber(\\d+)', destination: '/latest/page/:pageNumber', permanent: true },
  ]

  // The Network queue was a custom admin page of its own; it is now the list of Network stories (`collections/Network/NetworkItems.ts`), one screen.
  const adminRedirects = [{ source: '/admin/network-queue', destination: '/admin/collections/network-items', permanent: false }]

  // The home page built from blocks was previewed at /home-blocks beside the coded one; it is the home page now (2026-11-21).
  const homeRedirects = [{ source: '/home-blocks', destination: '/', permanent: false }]

  // The Unearthing Florida hub was a coded page at /unearthing-florida. The show is listed like every other show and its home is a page of blocks at its own address (hubs redesign,
  // 2026-11-23): the old hub address leads there. Only the hub's own address: the episodes under /unearthing-florida/<date>/<slug> keep their addresses until the archive migration moves them.
  const unearthingRedirects = [{ source: '/unearthing-florida', destination: '/shows/unearthing-florida', permanent: true }]

  // First: a trailing slash goes to the address without one, as Next itself did before `skipTrailingSlashRedirect` (`next.config.ts`), except
  // under PostHog's relay, whose API paths end in a slash.
  return [trailingSlashRedirect(), ...givingRedirects, ...postsRedirects, ...adminRedirects, ...homeRedirects, ...unearthingRedirects, internetExplorerRedirect]
}
