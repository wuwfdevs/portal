import type { NextConfig } from 'next'

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

  return [...givingRedirects, ...postsRedirects, internetExplorerRedirect]
}
