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
