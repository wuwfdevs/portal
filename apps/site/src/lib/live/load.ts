import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Contributor, LivePost, LiveUpdate } from '@/payload-types'

export interface LiveBlogData {
  blog: LivePost
  /** Pinned updates, in the order an editor set (only ones that belong to this blog). */
  pinned: LiveUpdate[]
  /** Every other update, newest first. */
  updates: LiveUpdate[]
  live: boolean
  startedAt: string
  /** Changes whenever an update is added, changed or removed; what the page polls for. */
  token: string
}

/** The most updates one page shows. A blog longer than this would need paging; none of the three in the archive is close. */
export const MAX_UPDATES = 250

const idOf = (v: { id: string | number } | string | number | null | undefined): string | number | null => (v == null ? null : typeof v === 'object' ? v.id : v)

/** A cheap fingerprint of a blog's updates: how many, and the latest change. The page asks for it every so often. */
export const feedToken = (count: number, latestUpdatedAt: string | null | undefined): string => `${count}:${latestUpdatedAt ?? ''}`

/**
 * A published live blog and its updates, or null when none has that address. Reads go through access control: a draft blog
 * is invisible, and so are its updates.
 */
export async function loadLiveBlog(slug: string): Promise<LiveBlogData | null> {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({ collection: 'live-posts', where: { slug: { equals: slug } }, draft: false, depth: 2, limit: 1, overrideAccess: false })
  const blog = found.docs[0]
  if (!blog) return null

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
  const latest = all.docs.reduce<string | null>((m, u) => (!m || u.updatedAt > m ? u.updatedAt : m), null)

  return {
    blog,
    pinned,
    updates: all.docs.filter((u) => !pinnedSet.has(String(u.id))),
    live: blog.coverage !== 'ended',
    startedAt: blog.legacy?.startedAt ?? blog.createdAt,
    token: feedToken(all.docs.length, latest),
  }
}

/** The names on an update, or an empty list. */
export const updateAuthors = (u: Pick<LiveUpdate, 'authors'>): string[] =>
  (u.authors ?? []).map((a) => (a && typeof a === 'object' ? (a as Contributor).name : null)).filter((n): n is string => Boolean(n))
