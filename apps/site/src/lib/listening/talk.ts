import type { ListeningHub, ListeningHubEvent, ListeningQuery } from '@wuwf/portal-contracts'

import { hubSessions } from './event'
import { plural } from './flow'

/**
 * Talking a question over with other people: the rules for what a question's page offers once someone has the question in front of them.
 * Answering alone is the page's main action; convening is the next step, never a second button beside it. Pure: the pages and the question
 * card draw from these, so the words and the conditions are tested here.
 */

/** The hosting the Portal allows for a question, as the question's own flags say. */
export type GatherOptions = { table: boolean; request: boolean }

export function gatherOptions(query: Pick<ListeningQuery, 'canHostTable' | 'canRequestHost'>): GatherOptions {
  return { table: query.canHostTable === true, request: query.canRequestHost === true }
}

/** Whether a reader may be offered a way to gather people themselves. */
export function canGather(query: Pick<ListeningQuery, 'canHostTable' | 'canRequestHost'>): boolean {
  const options = gatherOptions(query)
  return options.table || options.request
}

/** The page where someone chooses how to gather, and the place on the question's page that holds the sessions and the way in. */
export function gatherPath(publicId: string): string {
  return `/listens/${publicId}/gather`
}
export const TALK_ANCHOR = 'talk-it-over'
export function talkPath(publicId: string): string {
  return `/listens/${publicId}#${TALK_ANCHOR}`
}

/** The listed sessions of one question, soonest first, a full one after the ones with seats. */
export function sessionsOf(hub: Pick<ListeningHub, 'events'> | null | undefined, publicId: string): ListeningHubEvent[] {
  return hubSessions(hub ?? {}).filter((event) => event.queryPublicId === publicId)
}

/** Whether the "talk it over" part of a question's page has anything to show: a session to join, or a way to gather. */
export function talkVisible(query: Pick<ListeningQuery, 'canHostTable' | 'canRequestHost'>, sessions: readonly ListeningHubEvent[]): boolean {
  return sessions.length > 0 || canGather(query)
}

/**
 * The line under a question's card on the hub: information, not an action. "1 session coming up", or nothing to say. A question
 * with no session says so only as plain text; the way to gather lives on the question's page.
 */
export function sessionsLine(count: number): string {
  return count > 0 ? `${plural(count, 'session')} coming up` : 'No sessions yet.'
}

/** Which of the two ways to gather a page offers: both (the reader chooses), one (no choice to make), or none. */
export type GatherMode = 'choose' | 'table' | 'request' | 'none'
export function gatherMode(options: GatherOptions): GatherMode {
  if (options.table && options.request) return 'choose'
  if (options.table) return 'table'
  if (options.request) return 'request'
  return 'none'
}

/** The line beside the Gather button: what the reader will be asked next, in the words of what they can do. */
export function gatherHint(options: GatherOptions): string | null {
  switch (gatherMode(options)) {
    case 'choose':
      return 'A few neighbors, or a bigger group with WUWF’s help.'
    case 'table':
      return 'A few neighbors at your own table, starting now.'
    case 'request':
      return 'Tell WUWF what you have in mind and someone will write back.'
    case 'none':
      return null
  }
}

/** The intro under "Talk it over with others". */
export const TALK_INTRO = 'The same questions, discussed around a table. Each table is recorded only with everyone’s agreement.'
