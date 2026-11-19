import type { Where } from 'payload'

import type { AudioSkipReason } from './types'

/**
 * What the Network queue screen decides before it draws anything: which stories a filter means, how old a story reads, and what to tell an
 * editor when a picture or audio file was left out. Pure, so it is tested without the admin.
 */

export const QUEUE_VIEWS = [
  { key: 'waiting', label: 'Waiting', statuses: ['new', 'held'] },
  { key: 'held', label: 'Kept for later', statuses: ['held'] },
  { key: 'gone', label: 'Removed at the source', statuses: ['gone'] },
] as const

export type QueueViewKey = (typeof QUEUE_VIEWS)[number]['key']

export const isQueueView = (value: unknown): value is QueueViewKey => QUEUE_VIEWS.some((v) => v.key === value)

/**
 * Whether an editor can publish a story from the queue. It cannot until the CDS story-body converter exists (ROADMAP -> Network content);
 * the screen says so once, in a banner, instead of drawing a disabled button on every row. Turn this on when publishing is built.
 */
export const PUBLISH_AVAILABLE = false

/** Stories per page of the queue. */
export const QUEUE_PAGE_SIZE = 25

/** The page number a query string means: a plain positive whole number, else the first page (never put into a query as text). */
export function queuePage(value: unknown): number {
  const n = typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : 1
  return n >= 1 ? n : 1
}

/** "26 to 50 of 112", for the line under the list. */
export function pageRange(page: number, size: number, total: number): { from: number; to: number; pages: number } {
  const pages = Math.max(1, Math.ceil(total / size))
  if (total === 0) return { from: 0, to: 0, pages }
  const from = (Math.min(page, pages) - 1) * size + 1
  return { from, to: Math.min(from + size - 1, total), pages }
}

/** The address of one state of the queue. Defaults are left out so the plain address stays the plain address. */
export function queueHref(base: string, state: { view?: QueueViewKey; source?: number | null; page?: number }): string {
  const q = new URLSearchParams()
  if (state.view && state.view !== 'waiting') q.set('view', state.view)
  if (state.source !== null && state.source !== undefined) q.set('source', String(state.source))
  if (state.page && state.page > 1) q.set('page', String(state.page))
  const text = q.toString()
  return text ? `${base}?${text}` : base
}

/** A picture address that is safe to put in an `<img>`: https only. The picture stays where NPR hosts it (decided 2026-11-18); this only draws it. */
export function thumbnailHref(href: string | null | undefined): string | null {
  if (!href) return null
  try {
    return new URL(href).protocol === 'https:' ? href : null
  } catch {
    return null
  }
}

/** The query for a filter. An unknown view is "waiting"; a source id that is not a number is ignored (never put into a query as text). */
export function queueFilter(params: { view?: unknown; source?: unknown }): { view: QueueViewKey; sourceId: number | null; where: Where } {
  const view: QueueViewKey = isQueueView(params.view) ? params.view : 'waiting'
  const statuses = QUEUE_VIEWS.find((v) => v.key === view)!.statuses
  const n = typeof params.source === 'string' && /^\d{1,9}$/.test(params.source) ? Number(params.source) : null
  const clauses: Where[] = [{ status: { in: [...statuses] } }]
  if (n !== null) clauses.push({ source: { equals: n } })
  return { view, sourceId: n, where: { and: clauses } }
}

/** "12 min ago", "3 hr ago", "2 days ago". Nothing for a date that is missing or unreadable. */
export function ago(iso: string | null | undefined, now: Date): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const minutes = Math.max(0, Math.round((now.getTime() - t) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} hr ago`
  return `${Math.round(hours / 24)} days ago`
}

const AUDIO_NOTES: Record<AudioSkipReason, string> = {
  unavailable: 'Audio left out: not ready at the source yet.',
  expired: 'Audio left out: its stream has expired.',
  restricted: 'Audio left out: NPR marks it restricted.',
  premium: 'Audio left out: it is premium audio.',
  tracked: 'Audio left out: the only copy carries tracking.',
  sponsored: 'Audio left out: the only copy carries sponsorship messages.',
  'no-file': 'Audio left out: no playable file.',
}

export const audioNote = (skip: string | null | undefined): string | null => (skip && skip in AUDIO_NOTES ? AUDIO_NOTES[skip as AudioSkipReason] : null)

export const imageNote = (droppedAsRestricted: boolean | null | undefined): string | null => (droppedAsRestricted ? 'Picture left out: NPR marks it restricted.' : null)

export type QueueStatus = 'new' | 'held' | 'gone'

/**
 * What an editor may do with a story in each state, matching `status.ts`: keep a new one, put a kept one back, dismiss any. `dismiss` is
 * separate because it is the one move that cannot be undone (the story's words are cleared), so the screen asks first.
 */
export function rowMoves(status: QueueStatus): { keep: { to: 'held' | 'new'; label: string } | null; dismiss: true } {
  if (status === 'new') return { keep: { to: 'held', label: 'Keep for later' }, dismiss: true }
  if (status === 'held') return { keep: { to: 'new', label: 'Put back in the queue' }, dismiss: true }
  return { keep: null, dismiss: true }
}

/**
 * What a bulk action does to a selection: it applies to the stories it may, and the screen says how many it left alone. A story that is
 * `gone` can only be dismissed, so "Keep for later" skips it.
 */
export function bulkTargets(rows: readonly { id: string; status: QueueStatus }[], action: 'held' | 'new' | 'dismissed'): { ids: string[]; skipped: number } {
  const ids = rows
    .filter((r) => (action === 'dismissed' ? true : action === 'held' ? r.status === 'new' : r.status === 'held'))
    .map((r) => r.id)
  return { ids, skipped: rows.length - ids.length }
}
