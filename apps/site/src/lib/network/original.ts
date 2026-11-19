/**
 * A story from another station or from NPR keeps an "original" (an address and a credit line). Pure helpers for it.
 */

/** A full https address. Anything else (http, `javascript:`, a bare word) is not an original address. */
export function isHttpsAddress(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return new URL(value.trim()).protocol === 'https:'
  } catch {
    return false
  }
}

type PostLike = { source?: string | null; original?: { url?: string | null } | null }

/**
 * The address a story's `rel=canonical` should name. A WUWF story is its own canonical (null here: the caller uses its path). A story from
 * another station or from NPR names the original publisher's address (owner decision, 2026-11-18), when it has a valid one.
 */
export function canonicalOverride(post: PostLike): string | null {
  if (!post.source || post.source === 'wuwf') return null
  const url = post.original?.url
  return isHttpsAddress(url) ? url.trim() : null
}

/** The label a card or story page shows for a story that is not WUWF's: "From WLRN". Null for WUWF's own stories and for ones with no credit. */
export function sourceLabel(post: { source?: string | null; original?: { credit?: string | null } | null }): string | null {
  if (!post.source || post.source === 'wuwf') return null
  const credit = post.original?.credit?.trim()
  if (credit) return `From ${credit}`
  return post.source === 'npr' ? 'From NPR' : null
}
