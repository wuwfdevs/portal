import type { ListeningQuery, ListeningQuestion } from '@wuwf/portal-contracts'

/**
 * The inline asks (components B, C and D) put one question of a query into a story, a topic page or the end of an episode.
 * They ask the query's FIRST question and nothing else, and send the response as a whole: so a query is only offered inline
 * when answering that one question can finish the response, that is, when no OTHER question is required. Otherwise the
 * Portal would (rightly) refuse to finalize, and the honest thing is the invitation to the full set, not a form that cannot
 * work. The same goes for a query that requires a detail the inline form has no box for.
 */
export function inlineQuestion(query: Pick<ListeningQuery, 'questions' | 'state' | 'fields'>): ListeningQuestion | null {
  if (query.state !== 'open') return null
  // An inline ask carries a name and an email box at most. A query that requires anything else needs the full set.
  if (query.fields.city === 'required' || query.fields.phone === 'required' || query.fields.note === 'required') return null
  const [first, ...others] = [...query.questions].sort((a, b) => a.position - b.position)
  if (!first) return null
  return others.some((other) => other.required) ? null : first
}

/** "Leigh Ostrander" -> "Leigh". The button says who receives it; with no name it says WUWF. */
export function recipientName(query: Pick<ListeningQuery, 'askedBy'>): string {
  const first = query.askedBy?.trim().split(/\s+/)[0]
  return first ? first : 'WUWF'
}

/** "Where WUWF Listens is from": the eyebrow of an inline ask, e.g. "WUWF Listens · Coastal Futures". */
export function inlineEyebrow(query: Pick<ListeningQuery, 'contextLabel' | 'fromLabel'>): string {
  const place = query.contextLabel?.trim() || query.fromLabel?.trim()
  return place ? `WUWF Listens · ${place}` : 'WUWF Listens'
}

/** Whether the "answer all N questions" link is worth showing. */
export function otherQuestionCount(query: Pick<ListeningQuery, 'questions'>): number {
  return Math.max(0, query.questions.length - 1)
}
