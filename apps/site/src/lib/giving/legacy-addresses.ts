// Grove's giving pages and where each goes on this site once wuwf.org is switched over. Pure, and no imports from `@/`, because
// `redirects.ts` (read by next.config.ts) loads it.
//
// Sources: the standalone pages in `census/url-inventory/standalone-dispositions.csv` (the 2026-11-04 sitemap read), and a read of
// Grove's own giving pages on 2026-11-18 (owner-approved; robots.txt allows all, neutral client, 3 s apart) that found what no sitemap lists:
// `/donate` (Grove answers 301 to `/thanks-for-your-support`; every Grove page links to it) and a probe of 16 likely addresses, of which only
// `/donate` exists (the rest are 404). Grove also serves redirects no sitemap lists in general (ROADMAP), so an old giving address that is
// not here, such as one printed in a newsletter or read on air, is a line to add. Search Console's links report is how to find them.
//
// The two dated stories under `/support/` are here because `support` is a path this site owns (`RESERVED_FIRST_SEGMENTS`): a record may not
// take a path under it, so they could not be imported at their own addresses.

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
  {
    source: '/donate',
    destination: '/support',
    permanent: false,
    why: 'Grove answers 301 to /thanks-for-your-support, and links to /donate from every page. Goes straight to the Give page, as the donation page does, and is temporary for the same reason.',
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
  {
    source: '/support/2014-10-31/wuwf-corporate-sponsors',
    destination: '/sponsor',
    permanent: true,
    why: 'A 2014 story in Grove\'s support section about corporate sponsors. Cannot be imported at this address (reserved), and its subject is the sponsorship pages.',
  },
  {
    source: '/support/2017-02-08/wuwf-corporate-support',
    destination: '/sponsor',
    permanent: true,
    why: 'A 2017 story in Grove\'s support section about corporate support: the same.',
  },
]

/** The same list in the shape Next's `redirects()` takes. */
export const legacyGivingRedirects = (): { source: string; destination: string; permanent: boolean }[] =>
  LEGACY_GIVING_REDIRECTS.map(({ source, destination, permanent }) => ({ source, destination, permanent }))
