// The reads behind the home page's blocks (Front page, News run, Fellowship feature). Each goes through the Local API with access control on (`overrideAccess: false`,
// published only), is cached for the rest of the render with React's `cache` (a section asks once for the ordered pass and once to draw), and reads the same fields the coded
// home page reads (`CARD_FIELDS`), so a card looks the same in both. Blocks import this file only dynamically, when they draw: the block registry is loaded by the Payload
// config, and this file loads the config.

import configPromise from '@payload-config'
import { getPayload, type Where } from 'payload'
import { cache } from 'react'

import { arrangeHomepage } from '@/lib/homepage/select'
import { CARD_FIELDS, type HomeStory } from '@/lib/homepage/story'
import { MODULE_SLACK } from '@/lib/homepage/modules'
import { getFellowshipHubAcknowledgments } from '@/lib/underwriting/load'
import { VOYAGER_IDENTITY_SLUG } from '@/lib/voyager/identity'
import type { PageSetSpec } from '@/lib/page-sets/registry'
import type { Fellowship } from '@/payload-types'

import { relationId } from '@/lib/section-data/shape'
import type { AcknowledgmentLine } from '@/lib/underwriting/resolve'

const RECENT_LIMIT = 40
export const TOP_COUNT = 5

const readStories = cache(async (whereKey: string, limit: number): Promise<HomeStory[]> => {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({ collection: 'posts', depth: 1, draft: false, limit, overrideAccess: false, pagination: false, sort: '-publishedAt', select: CARD_FIELDS, where: JSON.parse(whereKey) as Where })
  return found.docs as HomeStory[]
})

const stories = (where: Where, limit: number) => readStories(JSON.stringify(where), limit)

/** Whose stories a page's story blocks read (`PageSetSpec.stories`). */
export type StoryScope = PageSetSpec['stories']

/** The id of The Voyager's publishing identity, or null while it has not been made (then a Voyager page has no stories, not the station's). */
export const voyagerIdentityId = cache(async (): Promise<string | number | null> => {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({ collection: 'publishing-identities', where: { slug: { equals: VOYAGER_IDENTITY_SLUG } }, limit: 1, depth: 0, pagination: false, overrideAccess: false, select: { slug: true } })
  return found.docs[0]?.id ?? null
})

/** The condition a scope adds to a read: nothing for the station's pages; The Voyager's identity for its pages (an id that matches nothing when the identity does not exist). */
const scopeWhere = async (scope: StoryScope): Promise<Where[]> => (scope === 'voyager' ? [{ publishingIdentity: { equals: (await voyagerIdentityId()) ?? 0 } }] : [])

/** The newest published stories filed under a section, whatever their source (Florida News is featured on purpose), `count` plus the slack the ordered pass needs. On a Voyager page, only the Voyager's. */
export const newestInSection = async (sectionId: string | number, count: number, scope: StoryScope = 'station'): Promise<HomeStory[]> =>
  stories({ and: [{ section: { equals: sectionId } }, ...(await scopeWhere(scope))] }, count + MODULE_SLACK)

/** The newest of WUWF's own stories: what the lead and the Briefing fall back to. On a Voyager page, the newest of the Voyager's. */
export const newestOwn = async (limit: number = RECENT_LIMIT, scope: StoryScope = 'station'): Promise<HomeStory[]> =>
  scope === 'voyager' ? stories({ and: await scopeWhere(scope) }, limit) : stories({ source: { equals: 'wuwf' } }, limit)

/**
 * Published stories by id, in the order given. An id that is no longer published is left out. On a Voyager page (`scope`) an id whose story was published under another identity is left out too,
 * so an editor's pick (or a featured story copied from the old hub) can never put the station's reporting under the student newspaper's name: the page falls back to the Voyager's newest.
 */
export async function storiesByIds(ids: readonly (string | number)[], scope: StoryScope = 'station'): Promise<HomeStory[]> {
  if (ids.length === 0) return []
  const found = await stories({ and: [{ id: { in: [...ids] } }, ...(await scopeWhere(scope))] }, ids.length)
  const byId = new Map(found.map((s) => [String(s.id), s]))
  return ids.map((id) => byId.get(String(id))).filter((s): s is HomeStory => Boolean(s))
}

/** A section's title and address. Null when it was deleted. */
export const sectionById = cache(async (id: string | number): Promise<{ id: string | number; title: string; slug: string } | null> => {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({ collection: 'sections', where: { id: { equals: id } }, limit: 1, depth: 0, overrideAccess: false, pagination: false, select: { title: true, slug: true } })
  const s = found.docs[0]
  return s ? { id: s.id, title: s.title, slug: s.slug ?? '' } : null
})

/**
 * The lead and the Briefing as the editors set them: the chosen lead, else the newest of WUWF's own; the chosen top stories, filled up to five with the newest. The same
 * arrangement the coded home page makes (`arrangeHomepage`), returned as ids in order (the lead first) so the page's ordered pass can claim them before any news run does.
 */
export async function arrangeFront(block: { lead?: unknown; topStories?: unknown }, scope: StoryScope = 'station'): Promise<{ lead: HomeStory | null; top: HomeStory[] }> {
  const leadId = relationId(block.lead)
  const topIds = (Array.isArray(block.topStories) ? block.topStories : []).map(relationId).filter((v): v is string | number => v !== null)
  const [recent, picked] = await Promise.all([newestOwn(RECENT_LIMIT, scope), storiesByIds([...(leadId !== null ? [leadId] : []), ...topIds], scope)])
  const byId = new Map(picked.map((s) => [String(s.id), s]))
  return arrangeHomepage({
    curatedLead: leadId !== null ? (byId.get(String(leadId)) ?? null) : null,
    curatedTop: topIds.map((id) => byId.get(String(id))).filter((s): s is HomeStory => Boolean(s)),
    recent,
    topCount: TOP_COUNT,
  })
}

export interface FeatureView {
  fellowship: Fellowship
  story: HomeStory | null
  acknowledgments: AcknowledgmentLine[]
}

/** The fellowship feature: the chosen story, else the fellowship's newest. Null when the fellowship is gone. The funder lines are read on the server and only the approved wording returns. */
export const loadFeature = cache(async (fellowshipId: string | number, storyId: string | number | null): Promise<FeatureView | null> => {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({ collection: 'fellowships', where: { id: { equals: fellowshipId } }, depth: 1, limit: 1, overrideAccess: false })
  const fellowship = found.docs[0]
  if (!fellowship) return null
  const chosen = storyId !== null ? ((await storiesByIds([storyId]))[0] ?? null) : null
  const story = chosen ?? (await stories({ fellowship: { equals: fellowship.id } }, 1))[0] ?? null
  return { fellowship, story, acknowledgments: await getFellowshipHubAcknowledgments(payload, fellowship.id, new Date().toISOString()) }
})
