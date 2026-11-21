// The retired Home page global's settings as sections for a home-set page record: how the home page was first written, and how a database whose global still holds an editor's
// choices gets a page from them (`scripts/sections/seed-home-page.ts`). Pure: it reads the global's fields and says what to write, and what it could not carry over.
//
// The order is the old coded page's: the front page lead, the fellowship feature, the short videos, one news run per section, the podcasts, the RadioLive and Unearthing
// panels. The banner is not here (it is the Site banner global), and neither are the sponsor tiles (the page set's slots draw those) or the page's foot (`HomeFoot`: the
// "All stories" button and the membership appeal).

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
        series: idOf(s.videoRow?.series),
      }),
    )
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

  notCarried.push('The coded page falls back to one "Latest stories" run when no news section has stories; a page of blocks with no news run shows none.')
  return { sections, notCarried }
}

/** The home page's address: it is served at `/`, and the record has no path of its own (its address name is `home`). */
export const HOME_PAGE_PATH = '/'

/** The page record's address name, and what it says about itself. */
export const HOME_PAGE = {
  title: 'Home page',
  slug: 'home',
  pageSet: 'home',
  summary: 'Public radio and journalism for Northwest Florida: local news, NPR, and WUWF originals from Pensacola.',
  seoTitle: 'WUWF Public Media',
} as const
