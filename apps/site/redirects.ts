import type { NextConfig } from 'next'

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

  // Grove's donation page. The stock "Support Local Stories. Donate Here." lines already point at /support; this catches every
  // other place the old address is still used (stories outside the sample, newsletters, on-air mentions). Temporary (307),
  // not permanent, so it can be pointed at the donation form later without browsers having cached the old answer.
  const groveSupportRedirect = { source: '/thanks-for-your-support', destination: '/support', permanent: false }

  return [groveSupportRedirect, internetExplorerRedirect]
}
