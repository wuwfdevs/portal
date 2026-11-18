// Grove's giving pages and where each goes on this site once wuwf.org is switched over. Pure, and no imports from `@/`, because
// `redirects.ts` (read by next.config.ts) loads it.
//
// Source: the standalone pages in `census/url-inventory/standalone-dispositions.csv` (the 2026-11-04 sitemap read), which Grove serves
// as ordinary pages. The addresses below are the ones in that list; **Grove also serves redirects no sitemap lists** (ROADMAP, "Grove
// serves redirects that no sitemap lists"), so an old address that is not here (`/donate`, a vehicle-donation address) cannot be found
// from this repository. Search Console's links report, or the station's own links in newsletters and on air, is how to find those; add
// each as a line here.

export type LegacyGivingRedirect = {
  /** The address on Grove. */
  source: string
  /** Where it goes: a page on this site, with a `#place` or `?way=` where the page has one. */
  destination: string
  /** Why this destination, for whoever has to change it. */
  why: string
  /** 308 (true) for a page that is not coming back; 307 (false) for one that may be pointed somewhere else later. */
  permanent: boolean
}

export const LEGACY_GIVING_REDIRECTS: readonly LegacyGivingRedirect[] = [
  {
    source: '/thanks-for-your-support',
    destination: '/support',
    permanent: false,
    why: 'Grove\'s donation page: the stock "Support Local Stories. Donate Here." line pointed at it. Temporary (owner, 2026-11-06) so it can be pointed at the donation form later.',
  },
  { source: '/sustaining-membership', destination: '/support', permanent: true, why: 'Monthly giving is the Give page: its card leads with Monthly, and the Sustaining level is on it.' },
  { source: '/membership-levels-and-benefits', destination: '/support#levels', permanent: true, why: 'The levels section of the Give page.' },
  { source: '/day-sponsor-messages', destination: '/support#levels', permanent: true, why: 'Day Sponsor is a level of giving (board 14); its section is on the Give page, with the credit-guidelines link.' },
  { source: '/leave-a-legacy', destination: '/support/legacy', permanent: true, why: 'Board 14c.' },
  {
    source: '/real-estate-donation',
    destination: '/support/ways?way=vehicles',
    permanent: true,
    why: 'Board 14 lists "A car, boat or property" as one way to give and opens the vehicle panel. That panel does not yet describe real estate: see the roadmap.',
  },
]

/** The same list in the shape Next's `redirects()` takes. */
export const legacyGivingRedirects = (): { source: string; destination: string; permanent: boolean }[] =>
  LEGACY_GIVING_REDIRECTS.map(({ source, destination, permanent }) => ({ source, destination, permanent }))
