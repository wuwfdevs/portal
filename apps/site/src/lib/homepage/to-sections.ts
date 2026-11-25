// The retired Home page global's settings as sections for a home-set page record: how the home page was first written, and how a database whose global still holds an editor's
// choices gets a page from them (`scripts/sections/seed-home-page.ts`). Pure: it reads the global's fields and says what to write, and what it could not carry over.
//
// The order is the homepage rethink's (2026-11-25): the front page lead, WUWF Listens (the reporters' open questions), the fellowship feature, the short videos, then the
// news in three tiers (the first news section as a full run with its lead, the next two as one row of three each, and up to three more as text-only headline columns,
// "More by section"), then the podcasts. The RadioLive and Unearthing panels are left off the home page: they keep their hubs. The banner is not here (it is the Site
// banner global), and neither are the sponsor tiles (the page set's slots draw those, after every other news run) or the page's foot (`HomeFoot`: the "All stories"
// button and the membership appeal).

import { HUB_WORDS } from '@/lib/listening/hub-pages'

import { newsRunCount } from './modules'

/** How many news sections take each tier: one full run, then rows, then headline columns. A section past the last tier is not carried over, and the mapping says so. */
export const NEWS_TIERS = { lead: 1, rows: 2, headlines: 3 } as const

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

  sections.push(
    section('listens', 'sectionListeningOpen', 'softlime', {
      variant: 'reporters',
      heading: { eyebrow: HUB_WORDS.label, title: HUB_WORDS.reportersTitle, intro: HUB_WORDS.reportersIntro },
      voiceOnlyIntro: HUB_WORDS.reportersVoiceOnly,
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

  // The news sections that are switched on and complete, in the editor's order, then shared out among the tiers.
  const news = (s.newsModules ?? []).flatMap((m, i) => {
    if (m.enabled === false) return []
    const sectionId = idOf(m.section)
    if (sectionId === null || !m.heading?.trim()) return []
    return [{ key: m.id ?? String(i + 1), sectionId, heading: m.heading.trim(), count: m.count }]
  })
  const leads = news.slice(0, NEWS_TIERS.lead)
  const rows = news.slice(NEWS_TIERS.lead, NEWS_TIERS.lead + NEWS_TIERS.rows)
  const tail = news.slice(NEWS_TIERS.lead + NEWS_TIERS.rows, NEWS_TIERS.lead + NEWS_TIERS.rows + NEWS_TIERS.headlines)
  const dropped = news.slice(NEWS_TIERS.lead + NEWS_TIERS.rows + NEWS_TIERS.headlines)
  for (const m of leads) sections.push(section(`news-${m.key}`, 'sectionNewsRun', 'plain', { variant: 'lead', section: m.sectionId, count: newsRunCount(m.count), heading: { title: m.heading } }))
  for (const m of rows) sections.push(section(`news-${m.key}`, 'sectionNewsRun', 'plain', { variant: 'row', section: m.sectionId, heading: { title: m.heading } }))
  if (tail.length > 0) sections.push(section('more-by-section', 'sectionHeadlines', 'plain', { sections: tail.map((m) => m.sectionId), count: 4, heading: { title: 'More by section' } }))
  if (dropped.length > 0) notCarried.push(`The home page holds ${NEWS_TIERS.lead + NEWS_TIERS.rows + NEWS_TIERS.headlines} news sections; these are not carried over: ${dropped.map((m) => m.heading).join(', ')}. Add one by hand if it is wanted.`)

  if (on(s.podcasts)) sections.push(section('podcasts', 'sectionShowSpotlight', 'grey', { featuredShow: idOf(s.podcasts?.featuredShow) }))

  if (on(s.radioLive) || on(s.unearthing)) notCarried.push('The RadioLive and Unearthing Florida panels are left off the home page (the homepage rethink, 2026-11-25); they keep their hubs.')

  notCarried.push('The coded page falls back to one "Latest stories" run when no news section has stories; a page of blocks with no news run shows none.')
  return { sections, notCarried }
}

/** The home page's address: it is served at `/`, and the record has no path of its own (its address name is `home`). */
export const HOME_PAGE_PATH = '/'

/** The home page record: its address name, and what it says about itself. It is the page marked "Use as the home page" (`isHome`), not the one named `home`. */
export const HOME_PAGE = {
  title: 'Home page',
  slug: 'home',
  pageSet: 'home',
  summary: 'Public radio and journalism for Northwest Florida: local news, NPR, and WUWF originals from Pensacola.',
  seoTitle: 'WUWF Public Media',
} as const
