// The RadioLive page, as sections (hubs redesign, slice 4; PAGE-BLOCKS.md phase 6): built from the words the coded hub held (the `radiolive-hub` global: tagline, host, Encores, support,
// the membership level) and from the design canvas's own copy. Pure: facts in, a page spec out; the migration `radiolive_page` writes it. Nothing is typed that the database does not hold
// or the canvas does not say: a bracketed line on the canvas is a review note and never prints, a count on the canvas is a stand-in and is never typed into a page, and a part with no
// words leaves its section out. What the shows, the artists and the latest recording are is read from them (Feature "latest set", Dates, List), so nobody edits the page each month.
//
// What the canvas has no place for, and so the page does not carry (the owner's decisions of 2026-11-23): the hub-wide "Plan your visit" panel (each show carries its own venue, and a Dates
// row shows it), the masthead's "next show" with its ticket button (the Dates rows are the next shows; a ticket status and a virtual-ticket link are on each show's page), and the button
// "The story of RadioLive" only when the global has an address for it. The membership level ("RadioLive 25") has no slot on the canvas either: it is carried as a Callout after Support so no
// price or contact is lost; the owner may delete the section.

export interface RadioLiveFacts {
  /** The global's words, each empty or trimmed. */
  tagline: string | null
  /** The picture at the top of the old hub: now the still of the lead when the latest set has none. */
  heroPhotoId: number | string | null
  host: { kicker: string | null; heading: string | null; text: string | null; portraitId: number | string | null; href: string | null }
  encores: { heading: string | null; text: string | null; linkLabel: string | null; href: string | null }
  support: { heading: string | null; text: string | null; note: string | null }
  membership: { heading: string | null; text: string | null; contactName: string | null; contactEmail: string | null; contactPhone: string | null; href: string | null } | null
}

export interface RadioLivePageSpec {
  slug: string
  title: string
  path: string
  description: string | null
  sections: Array<Record<string, unknown>>
}

export interface ArtistsPageSpec {
  slug: string
  title: string
  path: string
  navLabel: string
  /** Left out of the strip's own links: the home page's Artists section links to it. */
  navHidden: boolean
  sections: Array<Record<string, unknown>>
}

const clean = (v: string | null | undefined): string | null => (v && v.trim() !== '' ? v.trim() : null)

/** The RadioLive page, and the "All artists" page the Artists section links to. */
export function radioLivePages(f: RadioLiveFacts): { home: RadioLivePageSpec; artists: ArtistsPageSpec } {
  const tagline = clean(f.tagline)
  const sections: Array<Record<string, unknown>> = []

  sections.push({
    id: 'rl-lead',
    blockType: 'sectionFeature',
    hidden: false,
    tone: 'dark',
    variant: 'split',
    // Follows the shows: the newest recorded set (its date, title, description, picture and recording). These words are the page's when no show has a recording yet.
    latestSet: true,
    headline: 'RadioLive',
    ...(tagline ? { line: tagline } : {}),
    ...(f.heroPhotoId !== null ? { image: f.heroPhotoId } : {}),
    actions: [{ label: 'Watch past shows', href: '#watch' }, { label: 'Upcoming shows', href: '#shows' }],
  })
  sections.push({
    id: 'rl-dates',
    blockType: 'sectionDates',
    hidden: false,
    tone: 'plain',
    variant: 'rows',
    anchor: 'shows',
    navLabel: 'Shows',
    source: 'radiolive',
    count: 6,
    actionLabel: 'Tickets and details',
    heading: { eyebrow: 'Upcoming', title: 'Save your seat' },
  })
  sections.push({
    id: 'rl-watch',
    blockType: 'sectionList',
    hidden: false,
    tone: 'dark',
    variant: 'grid',
    anchor: 'watch',
    navLabel: 'Watch',
    source: 'performances',
    count: 6,
    heading: { title: 'Watch recent shows' },
  })
  sections.push({
    id: 'rl-artists',
    blockType: 'sectionList',
    hidden: false,
    tone: 'grey',
    variant: 'tiles',
    anchor: 'artists',
    navLabel: 'Artists',
    // The strip's "Artists" goes to the artists' own page (every artist, searchable), not to this short run of recent ones; that page is left out of the strip, so the strip has one Artists link.
    navHref: '/radiolive/artists',
    source: 'artists',
    count: 12,
    heading: { title: 'Recent artists' },
    moreLabel: 'All artists →',
    moreHref: '/radiolive/artists',
  })
  const { host, encores, support, membership } = f
  const hostText = clean(host.text)
  if (clean(host.heading) || hostText) {
    sections.push({
      id: 'rl-host',
      blockType: 'sectionProfileBand',
      hidden: false,
      tone: 'plain',
      variant: 'about',
      anchor: 'about',
      navLabel: 'About',
      heading: { ...(clean(host.kicker) ? { eyebrow: clean(host.kicker) } : {}), ...(clean(host.heading) ? { title: clean(host.heading) } : {}) },
      ...(hostText ? { text: hostText } : {}),
      ...(host.portraitId !== null ? { image: host.portraitId } : {}),
      ...(clean(host.href) ? { moreLabel: 'The story of RadioLive', moreHref: clean(host.href) } : {}),
    })
  }
  if (clean(encores.heading) || clean(encores.text)) {
    sections.push({
      id: 'rl-encores',
      blockType: 'sectionFeature',
      hidden: false,
      tone: 'teal',
      variant: 'hero',
      label: 'RadioLive Encores',
      headline: clean(encores.heading) ?? 'RadioLive Encores',
      ...(clean(encores.text) ? { line: clean(encores.text) } : {}),
      ...(clean(encores.href) ? { actions: [{ label: clean(encores.linkLabel) ?? 'Open the audio archive', href: clean(encores.href) }] } : {}),
    })
  }
  if (clean(support.heading) || clean(support.text)) {
    sections.push({
      id: 'rl-support',
      blockType: 'sectionSupport',
      hidden: false,
      tone: 'plain',
      heading: { eyebrow: 'Support RadioLive', ...(clean(support.heading) ? { title: clean(support.heading) } : {}), ...(clean(support.text) ? { intro: clean(support.text) } : {}) },
      label: 'Give to RadioLive',
      ...(clean(support.note) ? { note: clean(support.note) } : {}),
    })
  }
  if (membership && clean(membership.heading)) {
    const contact = [
      clean(membership.contactName) ? `For more information, contact ${clean(membership.contactName)}` : null,
      [clean(membership.contactEmail), clean(membership.contactPhone)].filter(Boolean).join(' or ') || null,
    ]
      .filter(Boolean)
      .join(' at ')
    sections.push({
      id: 'rl-membership',
      blockType: 'sectionCallout',
      hidden: false,
      tone: 'grey',
      variant: 'tint',
      title: clean(membership.heading),
      text: [clean(membership.text), contact ? `${contact}.` : null].filter(Boolean).join('\n\n') || clean(membership.heading),
      ...(clean(membership.href) ? { moreLabel: 'Learn more', moreHref: clean(membership.href) } : {}),
    })
  }

  return {
    home: { slug: 'radiolive', title: 'RadioLive', path: '/radiolive', description: tagline, sections },
    artists: {
      slug: 'radiolive-artists',
      title: 'All artists',
      path: '/radiolive/artists',
      navLabel: 'All artists',
      navHidden: true,
      sections: [
        {
          id: 'rl-all-artists',
          blockType: 'sectionArtistIndex',
          hidden: false,
          tone: 'plain',
          heading: { eyebrow: 'RadioLive', title: 'All artists', intro: 'Every artist who has been on a RadioLive show. Search by name, or choose a letter.' },
        },
      ],
    },
  }
}
