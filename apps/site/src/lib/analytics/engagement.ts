// When a reader has engaged with a page (`content_engaged`, `engagement_kind: 'read'`): they reached three quarters of the way down it and the
// page was in a visible tab for 30 seconds in all. A custom rule, not an audited standard (`ANALYTICS.md`, "Events"). Pure.

import type { ContentFormat, ContentKind, ContentRef } from './events'

export const READ_DEPTH = 0.75
export const READ_VISIBLE_MS = 30_000

/** How far down the page the bottom of the window is, from 0 to 1. A page no taller than the window is read to the end. */
export function scrollDepth(scrollY: number, viewportHeight: number, pageHeight: number): number {
  if (!(pageHeight > 0) || pageHeight <= viewportHeight) return 1
  return Math.min(1, Math.max(0, (scrollY + viewportHeight) / pageHeight))
}

export const isRead = (deepest: number, visibleMs: number): boolean => deepest >= READ_DEPTH && visibleMs >= READ_VISIBLE_MS

const idOf = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value !== '') return value
  if (value && typeof value === 'object' && 'id' in value) return idOf((value as { id: unknown }).id)
  return null
}

/**
 * The content reference for a story: an episode when it belongs to a show (a production) and is audio, else a story. Ids only; a relation
 * read as a bare id or as a record gives the same id. Its topic is its first category.
 */
export function storyContentRef(post: { id: number | string; format?: string | null; production?: unknown; categories?: readonly unknown[] | null }): ContentRef {
  const showId = idOf(post.production)
  const format = (['web', 'audio', 'video', 'live'] as const).find((f) => f === post.format) ?? null
  const kind: ContentKind = showId && format === 'audio' ? 'episode' : 'story'
  return { content_id: String(post.id), content_kind: kind, format: format as ContentFormat | null, show_id: showId, topic_id: idOf(post.categories?.[0]) }
}

/** The content reference for a show's own page. */
export const showContentRef = (show: { id: number | string }): ContentRef => ({ content_id: String(show.id), content_kind: 'show', format: null, show_id: String(show.id), topic_id: null })
