import type {
  ListeningHub,
  ListeningHubAnswered,
  ListeningHubEvent,
  ListeningHubOpen,
  ListeningOutcome,
} from '@wuwf/portal-contracts'

import { hubSessions } from './event'
import { plural } from './flow'

/** The words of the listening hub's cards (board 5). Pure, so the sentences are tested. */

const STATION_TIME_ZONE = 'America/Chicago'

/** "open until Nov. 30", or just "open" with no end date. */
export function closesLabel(closesAt: string | null): string {
  if (!closesAt) return 'open'
  const date = new Date(closesAt)
  if (Number.isNaN(date.getTime())) return 'open'
  const month = date.toLocaleDateString('en-US', { month: 'short', timeZone: STATION_TIME_ZONE })
  const day = date.toLocaleDateString('en-US', { day: 'numeric', timeZone: STATION_TIME_ZONE })
  // AP style abbreviates most months with a period; May, June and July are written out.
  const abbreviated = /^(May|Jun|Jul)$/.test(month) ? (month === 'May' ? 'May' : month === 'Jun' ? 'June' : 'July') : `${month}.`
  return `open until ${abbreviated} ${day}`
}

/** The hub card's line, as the board words it: "2 questions · voice or text · open until Dec. 12". */
export function openMeta(item: Pick<ListeningHubOpen, 'questionCount' | 'allowTextAnswers' | 'closesAt'>): string {
  return [plural(item.questionCount, 'question'), item.allowTextAnswers ? 'voice or text' : 'voice', closesLabel(item.closesAt)].join(' · ')
}

/** The line above a card's question: "Coastal Futures · Leigh Ostrander", or the desk, or nothing. */
export function deskLabel(item: Pick<ListeningHubOpen | ListeningHubAnswered, 'contextLabel' | 'askedBy' | 'fromLabel'>): string | null {
  const parts = [item.contextLabel, item.askedBy].map((part) => part?.trim()).filter((part): part is string => Boolean(part))
  if (parts.length > 0) return parts.join(' · ')
  return item.fromLabel?.trim() || null
}

/** Who answered, as the board words it for a question that has an outcome. No line for zero. */
export function answeredBy(count: number): string | null {
  if (count <= 0) return null
  return count === 1 ? 'One person answered' : `${count.toLocaleString('en-US')} people answered`
}

const OUTCOME_KIND_LABEL = { story: 'Story', episode: 'Episode', report: 'Report' } as const

/** "Story · After Isaias". */
export function outcomeKicker(outcome: Pick<ListeningOutcome, 'kind'>, contextLabel: string | null): string {
  const kind = OUTCOME_KIND_LABEL[outcome.kind]
  return contextLabel?.trim() ? `${kind} · ${contextLabel.trim()}` : kind
}

/** "Oct. 23, 2026" from a calendar date, with no timezone shift. */
export function outcomeDate(publishedAt: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(publishedAt)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12))
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** One open question as the hub shows it: the question, then every way to take part in it. */
export interface HubBand {
  question: ListeningHubOpen
  /** Its listed public sessions, soonest first. */
  sessions: ListeningHubEvent[]
}

export interface HubLayout {
  /** Every open question with its sessions: any question can be convened around, so each one is a band. */
  bands: HubBand[]
  /** The open questions, as plain cards. */
  questions: ListeningHubOpen[]
  /** Sessions whose question is not open on the hub (a listed session of a question that has since closed), shown on their own. */
  sessions: ListeningHubEvent[]
  /** The questions anyone may start a private one-table session around. */
  tables: ListeningHubOpen[]
}

/**
 * Groups what the Portal sent by question, so a question reads as one thing with several ways in: answer alone, join a session, host a
 * table of your own, ask to host a session. A session whose question is not open here stays in its own list.
 */
export function hubLayout(hub: ListeningHub): HubLayout {
  const sessions = hubSessions(hub)
  const open = new Set(hub.open.map((item) => item.publicId))
  const bands = hub.open.map((question): HubBand => ({ question, sessions: sessions.filter((item) => item.queryPublicId === question.publicId) }))
  return {
    bands,
    questions: hub.open,
    sessions: sessions.filter((item) => !(item.queryPublicId != null && open.has(item.queryPublicId))),
    tables: hub.open.filter((item) => item.canHostTable),
  }
}

/** The band's eyebrow: "After Isaias · Leigh Ostrander · open until Nov. 30". */
export function bandLabel(question: Pick<ListeningHubOpen, 'contextLabel' | 'askedBy' | 'fromLabel' | 'closesAt'>): string {
  return [deskLabel(question), closesLabel(question.closesAt)].filter(Boolean).join(' · ')
}
