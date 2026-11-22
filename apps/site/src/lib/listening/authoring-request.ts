import { LISTENING_AUTHORING_PATHS, isListeningAuthoringStatus, type ListeningAuthoringAction, type ListeningAuthoringPath } from '@wuwf/portal-contracts'

import { userCan } from '@/access/permissions'

/**
 * What the editor's browser may ask of the site's listening authoring route (a staff action), turned into the body the Portal receives. Only the named fields are
 * carried over (nothing the browser adds is forwarded), and the ACTOR is never taken from the browser: the route puts the signed-in
 * person's own Portal user id there. The Portal validates every value again; this only keeps the request the right shape.
 */
export const BROWSER_ACTIONS: Record<string, { action: ListeningAuthoringAction; path: ListeningAuthoringPath }> = {
  list: { action: 'list', path: LISTENING_AUTHORING_PATHS.list },
  get: { action: 'get', path: LISTENING_AUTHORING_PATHS.get },
  save: { action: 'save', path: LISTENING_AUTHORING_PATHS.save },
  'set-status': { action: 'set-status', path: LISTENING_AUTHORING_PATHS.setStatus },
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const QUERY_FIELDS = ['internalTitle', 'publicTitle', 'publicIntro', 'internalNotes', 'askedBy', 'fromLabel', 'contextLabel', 'allowTextAnswers', 'opensAt', 'closesAt'] as const
const QUESTION_FIELDS = ['id', 'prompt', 'guidance', 'required', 'maxDurationSeconds'] as const

function pick(source: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) if (source[f] !== undefined) out[f] = source[f]
  return out
}

/** The body for the Portal, or null when the browser's request is not shaped like one (the route answers 400). */
export function portalBodyFor(action: ListeningAuthoringAction, browser: unknown, portalUserId: string): Record<string, unknown> | null {
  const actor = { portalUserId }
  if (action === 'list') return { actor }
  if (!isRecord(browser)) return null
  if (action === 'get') return typeof browser['publicId'] === 'string' ? { actor, publicId: browser['publicId'] } : null
  if (action === 'set-status') {
    return typeof browser['publicId'] === 'string' && isListeningAuthoringStatus(browser['status']) ? { actor, publicId: browser['publicId'], status: browser['status'] } : null
  }
  // save
  if (!isRecord(browser['query']) || !Array.isArray(browser['questions'])) return null
  const questions: Record<string, unknown>[] = []
  for (const q of browser['questions']) {
    if (!isRecord(q)) return null
    questions.push(pick(q, QUESTION_FIELDS))
  }
  const publicId = browser['publicId']
  if (publicId !== undefined && publicId !== null && typeof publicId !== 'string') return null
  return { actor, ...(typeof publicId === 'string' ? { publicId } : {}), query: pick(browser['query'], QUERY_FIELDS), questions }
}

/**
 * Shown in the field for an account that is not linked to a Portal profile. That is the local administrator, or an account made by hand: it can hold every role and still
 * be refused, because the Portal checks a named person's Audience Listening grant and has no one to look up. It says so, and what to do, in the words the Portal's own
 * sign-in link uses ("the Website tool in the Portal").
 */
export const NOT_LINKED_MESSAGE =
  'You are signed in with a local account, not through the Portal. Listening queries are written under your Portal profile, so open the Website tool in the Portal to sign in that way. You can still paste a query’s code or address below.'

export const NOT_PERMITTED_MESSAGE = 'You do not have permission to write listening queries.'

/**
 * Whether the signed-in person may use the authoring route at all, and if not, the answer to give: signed out, or without the listening permission, is `not_allowed`;
 * a permitted person with no Portal profile is `not_linked` (a different problem with a different remedy). Null when they may go on, with the Portal user id to act as.
 */
export function authoringRefusal(user: { roles?: string[]; portalUserId?: string | null } | null): { error: 'not_allowed' | 'not_linked'; message: string } | { error: null; portalUserId: string } {
  if (!user || !userCan(user, 'listening.review')) return { error: 'not_allowed', message: NOT_PERMITTED_MESSAGE }
  if (!user.portalUserId) return { error: 'not_linked', message: NOT_LINKED_MESSAGE }
  return { error: null, portalUserId: user.portalUserId }
}
