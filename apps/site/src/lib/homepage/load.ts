import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Contributor, Fellowship, Homepage, Post } from '@/payload-types'

import { type BannerData, bannerOf } from '@/lib/banner'
import { getFellowshipHubAcknowledgments } from '@/lib/underwriting/load'
import type { AcknowledgmentLine } from '@/lib/underwriting/resolve'

import { ALL_STORIES_HREF, fallbackModule, fillModules, MAX_NEWS_MODULES, MODULE_SLACK, moduleCount, type FilledModule } from './modules'
import { arrangeHomepage } from './select'

const named = <T extends object>(value: T | string | number | null | undefined): T | null => (value && typeof value === 'object' ? value : null)
const idOf = (value: { id: string | number } | string | number | null | undefined): string | number | null =>
  value == null ? null : typeof value === 'object' ? value.id : value

/** The fields a homepage card needs; the story body is never loaded. */
export type HomeStory = Pick<Post, 'id' | 'title' | 'path' | 'publishedAt' | 'meta' | 'featuredMedia' | 'categories' | 'contributors' | 'section' | 'format' | 'featuredAudio'>

export const CARD_FIELDS = { title: true, path: true, publishedAt: true, meta: true, featuredMedia: true, categories: true, contributors: true, section: true, format: true, publishingIdentity: true, featuredAudio: true } as const

export interface HomepageData {
  /** The site banner, whatever its scope; the home page draws it only when it is meant for the home page (`bannerFor`). */
  banner: BannerData | null
  lead: HomeStory | null
  leadKicker: string | null
  top: HomeStory[]
  feature: { fellowship: Fellowship; story: HomeStory | null; acknowledgments: AcknowledgmentLine[] } | null
  /** The news band's titled runs, in the editors' order; each links to its section page. Never empty while any story is published. */
  modules: FilledModule<HomeStory>[]
  /** Where the band ends: every story, newest first. */
  allStoriesHref: string
}

export const TOP_COUNT = 5
const RECENT_LIMIT = 40

/**
 * Everything the home page shows. Every read goes through access control (`overrideAccess: false`), so only published
 * work can appear whatever an editor picked; a pick that has since been unpublished simply falls away and the slot is
 * filled from the newest work. The funder line on the fellowship feature is read on the server from records the public
 * cannot read, and only the approved wording comes back.
 */
export async function loadHomepage(): Promise<HomepageData> {
  const payload = await getPayload({ config: configPromise })
  const settings: Homepage = await payload.findGlobal({ slug: 'homepage', depth: 0, overrideAccess: false })

  const findStories = (where: Record<string, unknown>, limit: number) =>
    payload
      .find({ collection: 'posts', depth: 1, draft: false, limit, overrideAccess: false, pagination: false, sort: '-publishedAt', select: CARD_FIELDS, where: where as never })
      .then((r) => r.docs as HomeStory[])

  /** Published stories with these ids, in the order given. */
  const byIds = async (ids: (string | number)[]): Promise<HomeStory[]> => {
    if (ids.length === 0) return []
    const found = await findStories({ id: { in: ids } }, ids.length)
    const byId = new Map(found.map((s) => [String(s.id), s]))
    return ids.map((id) => byId.get(String(id))).filter((s): s is HomeStory => Boolean(s))
  }

  const leadId = idOf(settings.lead as never)
  const topIds = (settings.topStories ?? []).map((t) => idOf(t as never)).filter((v): v is string | number => v !== null)
  const feat = settings.fellowshipFeature
  const featStoryId = feat?.enabled ? idOf(feat.story as never) : null
  // The news band: each enabled row of "News sections" with a section and a heading (a row without either cannot be drawn).
  const moduleRows = (settings.newsModules ?? [])
    .filter((m) => m.enabled !== false)
    .slice(0, MAX_NEWS_MODULES)
    .map((m, i) => ({ key: m.id ?? `module-${i}`, heading: m.heading?.trim() ?? '', sectionId: idOf(m.section as never), count: moduleCount(m.count) }))
    .filter((m): m is typeof m & { sectionId: string | number } => m.sectionId !== null && m.heading !== '')

  // A section's run is every published story filed under it, whatever its origin: Florida News is a partner's reporting and is featured on
  // purpose (owner, 2026-11-18). The lead and the Briefing, which fall back to the newest work, stay WUWF's own.
  const sectionIds = moduleRows.map((m) => m.sectionId)
  const [recent, picked, sections, ...sectionStories] = await Promise.all([
    findStories({ source: { equals: 'wuwf' } }, RECENT_LIMIT),
    byIds([...(leadId !== null ? [leadId] : []), ...topIds, ...(featStoryId !== null ? [featStoryId] : [])]),
    sectionIds.length > 0 ? payload.find({ collection: 'sections', where: { id: { in: sectionIds } }, limit: sectionIds.length, depth: 0, overrideAccess: false, pagination: false, select: { slug: true } }).then((r) => r.docs) : Promise.resolve([]),
    ...moduleRows.map((m) => findStories({ section: { equals: m.sectionId } }, m.count + MODULE_SLACK)),
  ])
  const pickedById = new Map(picked.map((s) => [String(s.id), s]))
  const curatedLead = leadId !== null ? (pickedById.get(String(leadId)) ?? null) : null
  const curatedTop = topIds.map((id) => pickedById.get(String(id))).filter((s): s is HomeStory => Boolean(s))

  const { lead, top } = arrangeHomepage({ curatedLead, curatedTop, recent, topCount: TOP_COUNT })

  // The fellowship feature: the chosen story, else the fellowship's newest.
  let feature: HomepageData['feature'] = null
  const fellowshipId = feat?.enabled ? idOf(feat.fellowship as never) : null
  if (fellowshipId !== null) {
    const found = await payload.find({ collection: 'fellowships', where: { id: { equals: fellowshipId } }, depth: 1, limit: 1, overrideAccess: false })
    const fellowship = found.docs[0]
    if (fellowship) {
      const chosen = featStoryId !== null ? (pickedById.get(String(featStoryId)) ?? null) : null
      const story = chosen ?? (await findStories({ fellowship: { equals: fellowship.id } }, 1))[0] ?? null
      feature = { fellowship, story, acknowledgments: await getFellowshipHubAcknowledgments(payload, fellowship.id, new Date().toISOString()) }
    }
  }

  const shown = [lead, ...top, feature?.story].filter((s): s is HomeStory => Boolean(s))
  const slugById = new Map(sections.map((sec) => [String(sec.id), sec.slug]))
  const filled = fillModules(
    moduleRows.map((m, i) => {
      const slug = slugById.get(String(m.sectionId))
      return { key: m.key, heading: m.heading, href: slug ? `/${slug}` : null, count: m.count, candidates: sectionStories[i] ?? [] }
    }),
    shown,
  )
  // With no section set up (a new site) or none holding anything, one run of the newest stories stands in, so the page is never blank.
  const modules = filled.length > 0 ? filled : [fallbackModule(recent, shown)].filter((m): m is FilledModule<HomeStory> => m !== null)

  return {
    banner: bannerOf(settings.banner),
    lead,
    leadKicker: settings.leadKicker?.trim() || null,
    top,
    feature,
    modules,
    allStoriesHref: ALL_STORIES_HREF,
  }
}

/** "By Leigh Ostrander, Dave Dunwoody", or null when the story names no one. */
export function bylineOf(story: Pick<HomeStory, 'contributors'>): string | null {
  const names = (story.contributors ?? []).map((c) => named<Contributor>(c)?.name).filter((n): n is string => Boolean(n))
  return names.length > 0 ? `By ${names.join(', ')}` : null
}

/** The section's name when it was loaded, for the small label above a headline. */
export function kickerOf(story: Pick<HomeStory, 'section' | 'categories'>): string | null {
  const section = named<{ title?: string }>(story.section as never)
  return section?.title ?? null
}
