import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Contributor, Fellowship, Homepage, Post } from '@/payload-types'

import { getFellowshipHubAcknowledgments } from '@/lib/underwriting/load'
import type { AcknowledgmentLine } from '@/lib/underwriting/resolve'

import { arrangeHomepage, remainingStories } from './select'

const named = <T extends object>(value: T | string | number | null | undefined): T | null => (value && typeof value === 'object' ? value : null)
const idOf = (value: { id: string | number } | string | number | null | undefined): string | number | null =>
  value == null ? null : typeof value === 'object' ? value.id : value

/** The fields a homepage card needs; the story body is never loaded. */
export type HomeStory = Pick<Post, 'id' | 'title' | 'path' | 'publishedAt' | 'meta' | 'featuredMedia' | 'categories' | 'contributors' | 'section' | 'format'>

export const CARD_FIELDS = { title: true, path: true, publishedAt: true, meta: true, featuredMedia: true, categories: true, contributors: true, section: true, format: true } as const

export interface HomepageData {
  emergency: { label: string; headline: string; body: string | null; linkLabel: string | null; linkHref: string | null } | null
  lead: HomeStory | null
  leadKicker: string | null
  top: HomeStory[]
  feature: { fellowship: Fellowship; story: HomeStory | null; acknowledgments: AcknowledgmentLine[] } | null
  /** `href` is the section's own page when the list is filled from one section. */
  local: { heading: string; stories: HomeStory[]; href: string | null }
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
  const sectionId = idOf(settings.localNews?.section as never)
  const localCount = Math.min(12, Math.max(3, settings.localNews?.count ?? 6))

  const [recent, picked, localCandidates] = await Promise.all([
    findStories({ source: { equals: 'wuwf' } }, RECENT_LIMIT),
    byIds([...(leadId !== null ? [leadId] : []), ...topIds, ...(featStoryId !== null ? [featStoryId] : [])]),
    sectionId !== null ? findStories({ and: [{ source: { equals: 'wuwf' } }, { section: { equals: sectionId } }] }, RECENT_LIMIT) : Promise.resolve(null),
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
  const local = remainingStories(localCandidates ?? recent, shown, localCount)
  const sectionSlug = sectionId !== null ? ((await payload.find({ collection: 'sections', where: { id: { equals: sectionId } }, limit: 1, depth: 0, overrideAccess: false, select: { slug: true } })).docs[0]?.slug ?? null) : null

  const e = settings.emergency
  return {
    emergency: e?.active && e.headline?.trim() ? { label: e.label?.trim() || 'Emergency coverage', headline: e.headline.trim(), body: e.body?.trim() || null, linkLabel: e.linkLabel?.trim() || null, linkHref: e.linkHref?.trim() || null } : null,
    lead,
    leadKicker: settings.leadKicker?.trim() || null,
    top,
    feature,
    local: { heading: settings.localNews?.heading?.trim() || 'Northwest Florida', stories: local, href: sectionSlug ? `/${sectionSlug}` : null },
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
