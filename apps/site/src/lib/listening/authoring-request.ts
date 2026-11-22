import { LISTENING_AUTHORING_PATHS, isListeningAuthoringStatus, type ListeningAuthoringAction, type ListeningAuthoringPath } from '@wuwf/portal-contracts'

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
