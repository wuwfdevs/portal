import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Contributor, LiveUpdate, Post } from '@/payload-types'

import { feedToken } from './token'

/** A live blog as the page needs it. A live blog is a story (a post with format "live"); this is the part of it the page shows. */
export interface LiveBlog {
  id: string | number
  title: string
  slug: string
  description: string | null
  /** The words above the updates (the story's content). */
  intro: Post['content'] | null
  featuredMedia: Post['featuredMedia']
  coverage: 'live' | 'ended'
  endedAt: string | null
  updatedAt: string
  pinned: Post['live'] extends infer L ? (L extends { pinned?: infer P } ? P : never) : never
}

const toBlog = (p: Post): LiveBlog => ({
  id: p.id,
  title: p.title,
  slug: p.slug ?? '',
  description: p.meta?.description?.trim() || null,
  intro: p.content ?? null,
  featuredMedia: p.featuredMedia,
  coverage: p.live?.coverage === 'ended' ? 'ended' : 'live',
  endedAt: p.live?.endedAt ?? null,
  updatedAt: p.updatedAt,
  pinned: p.live?.pinned ?? null,
})

const liveBlogsWhere = (slug: string) => ({ and: [{ format: { equals: 'live' } }, { slug: { equals: slug } }] })

export interface LiveBlogData {
  blog: LiveBlog
  /** Pinned updates, in the order an editor set (only ones that belong to this blog). */
  pinned: LiveUpdate[]
  /** Every other update, newest first. */
  updates: LiveUpdate[]
  live: boolean
  startedAt: string
  /** Changes whenever an update, or the blog itself (ended, pinned, introduction), changes; what the page polls for. */
  token: string
}

type Payload = Awaited<ReturnType<typeof getPayload>>

/**
 * Whether a blog is live and its fingerprint. The page and the status endpoint both call this, so they can never disagree
 * (and a blog with more updates than the page shows still compares equal): the count is a real count, the latest change a
 * real query, and the blog's own state is part of it.
 */
async function feedStateFor(payload: Payload, blog: Pick<LiveBlog, 'id' | 'updatedAt' | 'coverage'>): Promise<{ live: boolean; token: string }> {
  const [count, latest] = await Promise.all([
    payload.count({ collection: 'live-updates', overrideAccess: false, where: { livePost: { equals: blog.id } } }),
    payload.find({ collection: 'live-updates', depth: 0, limit: 1, overrideAccess: false, pagination: false, select: { updatedAt: true }, sort: '-updatedAt', where: { livePost: { equals: blog.id } } }),
  ])
  return { live: blog.coverage !== 'ended', token: feedToken({ count: count.totalDocs, latestUpdateAt: latest.docs[0]?.updatedAt, blogUpdatedAt: blog.updatedAt, coverage: blog.coverage }) }
}

/** The status endpoint's answer for a blog address, or null when no published blog has it. */
export async function loadFeedState(slug: string): Promise<{ live: boolean; token: string } | null> {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({ collection: 'posts', where: liveBlogsWhere(slug) as never, draft: false, depth: 0, limit: 1, overrideAccess: false, select: { live: true, updatedAt: true } })
  const post = found.docs[0]
  return post ? feedStateFor(payload, toBlog(post as Post)) : null
}

/** The most updates one page shows. A blog longer than this would need paging; none of the three in the archive is close. */
export const MAX_UPDATES = 250

const idOf = (v: { id: string | number } | string | number | null | undefined): string | number | null => (v == null ? null : typeof v === 'object' ? v.id : v)

/**
 * A published live blog and its updates, or null when none has that address. Reads go through access control: a draft blog
 * is invisible, and so are its updates.
 */
export async function loadLiveBlog(slug: string): Promise<LiveBlogData | null> {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({ collection: 'posts', where: liveBlogsWhere(slug) as never, draft: false, depth: 2, limit: 1, overrideAccess: false })
  const post = found.docs[0]
  if (!post) return null
  const blog = toBlog(post)

  const all = await payload.find({
    collection: 'live-updates',
    depth: 1,
    limit: MAX_UPDATES,
    overrideAccess: false,
    pagination: false,
    sort: '-postedAt',
    where: { livePost: { equals: blog.id } },
  })
  const pinnedIds = (blog.pinned ?? []).map((p) => idOf(p as never)).filter((v): v is string | number => v !== null)
  const byId = new Map(all.docs.map((u) => [String(u.id), u]))
  const pinned = pinnedIds.map((id) => byId.get(String(id))).filter((u): u is LiveUpdate => Boolean(u))
  const pinnedSet = new Set(pinned.map((u) => String(u.id)))
  const state = await feedStateFor(payload, blog)

  return {
    blog,
    pinned,
    updates: all.docs.filter((u) => !pinnedSet.has(String(u.id))),
    live: state.live,
    startedAt: post.publishedAt ?? post.createdAt,
    token: state.token,
  }
}

/** The names on an update, or an empty list. */
export const updateAuthors = (u: Pick<LiveUpdate, 'authors'>): string[] =>
  (u.authors ?? []).map((a) => (a && typeof a === 'object' ? (a as Contributor).name : null)).filter((n): n is string => Boolean(n))
