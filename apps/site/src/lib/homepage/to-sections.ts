// The home page's settings (the Home page global) as sections for a home-set page record, so the page of blocks starts as a copy of the page editors run today and can be
// compared with it (PAGE-BLOCKS.md → Home). Pure: it reads the global's fields and says what to write, and what it could not carry over.
//
// The order is the coded page's: the front page lead, the fellowship feature, the short videos, one news run per section, the podcasts, the RadioLive and Unearthing
// panels. The emergency banner is not here (it is the site banner, in the layout), and neither are the sponsor tiles (the page set's slots draw those).

type Rel = { id: string | number } | string | number | null | undefined
const idOf = (r: Rel): string | number | null => (r == null ? null : typeof r === 'object' ? r.id : r)

export interface HomepageFields {
  lead?: Rel
  leadKicker?: string | null
  topStories?: readonly Rel[] | null
  fellowshipFeature?: { enabled?: boolean | null; fellowship?: Rel; story?: Rel } | null
  newsModules?: ReadonlyArray<{ id?: string | null; heading?: string | null; section?: Rel; count?: number | null; enabled?: boolean | null }> | null
  videoRow?: { enabled?: boolean | null; series?: Rel; count?: number | null } | null
  podcasts?: { enabled?: boolean | null; featuredShow?: Rel } | null
  radioLive?: { enabled?: boolean | null } | null
  unearthing?: { enabled?: boolean | null; episode?: Rel } | null
}

export interface HomeSection {
  id: string
  blockType: string
  anchor?: string
  tone: string
  hidden: false
  [field: string]: unknown
}

export interface HomeMapping {
  sections: HomeSection[]
  /** What the coded home page does that the blocks do not carry over, in words, for the person comparing the two. */
  notCarried: string[]
}

const section = (id: string, blockType: string, tone: string, fields: Record<string, unknown>): HomeSection => ({ id: `home-${id}`, blockType, tone, hidden: false, ...fields })
const on = (g: { enabled?: boolean | null } | null | undefined): boolean => g?.enabled !== false

export function homepageToSections(settings: HomepageFields | null | undefined): HomeMapping {
  const s = settings ?? {}
  const notCarried: string[] = []
  const sections: HomeSection[] = []

  sections.push(
    section('front-page', 'sectionFrontPage', 'plain', {
      lead: idOf(s.lead),
      leadKicker: s.leadKicker?.trim() || null,
      topStories: (s.topStories ?? []).map(idOf).filter((v): v is string | number => v !== null),
    }),
  )

  const feature = s.fellowshipFeature
  if (feature?.enabled && idOf(feature.fellowship) !== null) {
    sections.push(section('fellowship-feature', 'sectionFellowshipFeature', 'grey', { fellowship: idOf(feature.fellowship), story: idOf(feature.story) }))
  }

  if (on(s.videoRow)) {
    sections.push(
      section('short-videos', 'sectionList', 'plain', {
        source: 'clips',
        scope: 'latest',
        count: s.videoRow?.count ?? 6,
        variant: 'rail',
        heading: { title: 'Short videos from the region' },
        moreLabel: 'All videos',
        moreHref: '/video',
      }),
    )
    if (idOf(s.videoRow?.series) !== null) notCarried.push('The short-video row can put one series\' videos first; the List block has no series choice, so it shows the newest videos.')
  }

  for (const [i, m] of (s.newsModules ?? []).entries()) {
    if (m.enabled === false) continue
    const sectionId = idOf(m.section)
    if (sectionId === null || !m.heading?.trim()) continue
    sections.push(section(`news-${m.id ?? i + 1}`, 'sectionNewsRun', 'plain', { section: sectionId, count: m.count ?? 5, heading: { title: m.heading.trim() } }))
  }

  if (on(s.podcasts)) sections.push(section('podcasts', 'sectionShowSpotlight', 'grey', { featuredShow: idOf(s.podcasts?.featuredShow) }))

  if (on(s.radioLive) || on(s.unearthing)) {
    sections.push(
      section('panels', 'sectionFeaturePanels', 'plain', {
        radioLive: on(s.radioLive),
        unearthing: on(s.unearthing),
        unearthingEpisode: on(s.unearthing) ? idOf(s.unearthing?.episode) : null,
      }),
    )
  }

  notCarried.push('The "All stories" button that ends the news band and the membership appeal at the foot of the coded page are not blocks yet.')
  notCarried.push('The coded page falls back to one "Latest stories" run when no news section has stories; a page of blocks with no news run shows none.')
  return { sections, notCarried }
}

/** The page record's address name, and what it says about itself. It is a preview beside the coded home page and is not indexed. */
export const HOME_BLOCKS_PAGE = {
  title: 'Home page (blocks)',
  slug: 'home-blocks',
  pageSet: 'home',
  summary: 'The home page built from blocks, beside the coded home page, for comparison. Not linked from anywhere and not indexed.',
} as const
