// A Grove live blog (`/liveblog/LiveBlogPage.hbs`, at `/live-updates/<slug>`) to a live blog and its updates. Like the story
// converter it is pure (no network, no database) and never drops anything silently: whatever it cannot map is flagged.
// Each update's body goes through the same body converter as a story, so every block a story can hold, an update can too.

import { parseGroveDate } from '../live/time'
import { Ctx, plainText } from './context'
import { arr, leadItems, obj, str, template } from './enhancements'
import * as lex from './lexical'
import { bodyNodes } from './story'
import type { BlockItem, Json, JsonObject, LexicalState, PersonRef, StoryReport } from './types'

const LIVE_PAGE = '/liveblog/LiveBlogPage.hbs'

export interface ConvertedLiveUpdate {
  /** Grove's id for the update. The importer matches on it, so a re-run cannot duplicate. */
  postId: string
  /** The part of the address after `#`: kept exactly, so shared links still work. */
  anchor: string
  headline: string
  body: LexicalState
  /** The exact time it was posted (Grove's own millisecond timestamp). */
  postedAt: string
  /** Set only when Grove says it was edited and the time can be read. */
  editedAt: string | null
  authors: PersonRef[]
}

export interface ConvertedLiveBlog {
  legacy: { groveId: string; legacyPath: string; modifiedAt: string | null }
  slug: string
  title: string
  description: string | null
  startedAt: string | null
  coverage: 'live' | 'ended'
  endedAt: string | null
  intro: LexicalState | null
  featuredMedia: BlockItem[]
  updates: ConvertedLiveUpdate[]
  assets: import('./types').AssetRef[]
}

export type ConvertLiveResult =
  | { status: 'converted'; blog: ConvertedLiveBlog; report: StoryReport }
  | { status: 'skipped'; reason: 'not-a-live-blog'; report: StoryReport }

const slugOf = (url: string | undefined): string | undefined => /\/people\/([^/?#]+)/.exec(url ?? '')?.[1]

/** The end of coverage as Grove's own structured data states it, when it does. */
function coverageEnd(j: JsonObject): string | null {
  const ld = j.jsonLinkedData
  const text = typeof ld === 'string' ? ld : JSON.stringify(ld ?? '')
  return /"coverageEndTime"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? null
}

const iso = (ms: string | number | undefined): string | null => {
  const n = Number(ms)
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : null
}

function personOf(raw: Json, ctx: Ctx): PersonRef | null {
  const o = obj(raw)
  const name = plainText(str(o?.body)).text
  if (!o || !name) return null
  const slug = slugOf(str(o.href))
  if (!slug) ctx.note('byline.person-without-address', name)
  return { name, ...(slug ? { slug } : {}) }
}

export function convertLiveBlog(page: unknown): ConvertLiveResult {
  const j = obj(page)
  const groveId = str(j?.contentId) ?? ''
  let path = ''
  try {
    path = new URL(str(j?.canonicalLink) ?? '').pathname.replace(/\/$/, '')
  } catch {
    /* reported below */
  }
  if (!j || template(j) !== LIVE_PAGE) {
    const ctx = new Ctx(groveId || 'none')
    ctx.note('page.not-a-live-blog', template(j) || 'no template')
    return { status: 'skipped', reason: 'not-a-live-blog', report: ctx.report(path, groveId) }
  }

  const ctx = new Ctx(groveId || path)
  if (!groveId) ctx.fail('live.no-content-id')
  const slug = /^\/live-updates\/([^/]+)$/.exec(path)?.[1] ?? ''
  if (!slug) ctx.fail('live.no-address', path || 'no canonical address')
  const title = plainText(str(j.headline)).text
  if (!title) ctx.fail('live.no-headline')

  const introNodes = bodyNodes(arr(j.blogBody), ctx)
  const intro = introNodes.length > 0 ? lex.root(introNodes) : null
  const featuredMedia = leadItems(arr(j.blogLead), ctx)

  if (arr(j.pinnedPosts).length > 0) ctx.preserve('live.pinned-not-mapped', String(arr(j.pinnedPosts).length))

  const seenAnchors = new Set<string>()
  const seenIds = new Set<string>()
  const updates: ConvertedLiveUpdate[] = []
  for (const raw of arr(j.posts)) {
    const p = obj(raw)
    if (!p) {
      ctx.fail('live.update-not-an-object')
      continue
    }
    const postId = str(p.postId) ?? ''
    const anchor = str(p.anchor) ?? ''
    const headline = plainText(str(p.headline)).text
    const postedAt = iso(str(p.postedDateTimestamp) ?? (typeof p.postedDateTimestamp === 'number' ? p.postedDateTimestamp : undefined))
    if (!postId) ctx.fail('live.update-no-id', headline || anchor)
    if (!anchor) ctx.fail('live.update-no-anchor', headline)
    if (!headline) ctx.fail('live.update-no-headline', anchor)
    if (!postedAt) ctx.fail('live.update-no-time', headline || anchor)
    if (seenIds.has(postId) || seenAnchors.has(anchor)) ctx.fail('live.update-duplicate', anchor)
    seenIds.add(postId)
    seenAnchors.add(anchor)
    if (!postId || !anchor || !headline || !postedAt) continue

    const nodes = bodyNodes(arr(p.body), ctx)
    if (nodes.length === 0) ctx.note('live.update-empty-body', anchor)

    // Grove says an update was edited by giving an update time that differs from the posted time (both as words).
    const posted = str(p.postedDate)
    const updated = str(p.updateDate)
    let editedAt: string | null = null
    if (updated && updated !== posted) {
      editedAt = parseGroveDate(updated)
      if (!editedAt) ctx.note('live.edited-time-unreadable', `${anchor}: ${updated}`)
    }
    const authors = arr(p.authors).map((a) => personOf(a, ctx)).filter((a): a is PersonRef => a !== null)
    ctx.count('live:update')
    updates.push({ postId, anchor, headline, body: lex.root(nodes), postedAt, editedAt, authors })
  }

  const ended = j.liveEvent !== true
  const problems = [...(intro ? lex.lexicalProblems(intro) : []), ...lex.featuredProblems(featuredMedia), ...updates.flatMap((u) => lex.lexicalProblems(u.body))]
  for (const prob of problems) ctx.fail('output.invalid', prob)

  const blog: ConvertedLiveBlog = {
    legacy: { groveId, legacyPath: path, modifiedAt: str(j.dateModifiedISO) ?? null },
    slug,
    title,
    description: plainText(str(j.description)).text || null,
    startedAt: str(j.datePublishedISO) ?? null,
    coverage: ended ? 'ended' : 'live',
    endedAt: ended ? coverageEnd(j) : null,
    intro,
    featuredMedia,
    updates: updates.sort((a, b) => (a.postedAt < b.postedAt ? -1 : 1)),
    assets: [...ctx.assets.values()],
  }
  if (ended && !blog.endedAt) ctx.note('live.end-time-missing')
  return { status: 'converted', blog, report: ctx.report(path, groveId) }
}
