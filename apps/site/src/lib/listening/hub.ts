import type { ListeningHubAnswered, ListeningHubOpen, ListeningOutcome } from '@wuwf/portal-contracts'

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

/** "3 questions · by voice or in writing · open until Dec. 12". */
export function openMeta(item: Pick<ListeningHubOpen, 'questionCount' | 'allowTextAnswers' | 'closesAt'>): string {
  return [plural(item.questionCount, 'question'), item.allowTextAnswers ? 'by voice or in writing' : 'by voice', closesLabel(item.closesAt)].join(' · ')
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
