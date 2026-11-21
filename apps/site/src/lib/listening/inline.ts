import type { ListeningQuery } from '@wuwf/portal-contracts'

/**
 * Where the full question set is shown. It is always the same set, every question and every screen; the placement only changes the
 * frame around it: `page` is the question's own page (`/listens/<id>`), `story` sits in a story's body, `topic` at the head of a
 * topic page (a slim invitation that opens in place), `voice` at the end of an episode or video (it leads with recording).
 */
export type ListeningPlacement = 'page' | 'story' | 'topic' | 'voice'

/** "Where WUWF Listens is from": the eyebrow of a placed set, e.g. "WUWF Listens · Coastal Futures". */
export function inlineEyebrow(query: Pick<ListeningQuery, 'contextLabel' | 'fromLabel'>): string {
  const place = query.contextLabel?.trim() || query.fromLabel?.trim()
  return place ? `WUWF Listens · ${place}` : 'WUWF Listens'
}

/** The eyebrow with who asked, when the Portal says: "WUWF Listens · Coastal Futures · asked by Leigh Ostrander". */
export function placedEyebrow(query: Pick<ListeningQuery, 'contextLabel' | 'fromLabel' | 'askedBy'>): string {
  const by = query.askedBy?.trim()
  return by ? `${inlineEyebrow(query)} · asked by ${by}` : inlineEyebrow(query)
}

/** The first button: an episode's set leads with the microphone, every other one begins. */
export function beginLabel(placement: ListeningPlacement): string {
  return placement === 'voice' ? 'Record your answer' : 'Begin'
}

/** Voice placement only: who receives the message. Every send names who gets it; empty means WUWF. */
export function recipientLine(recipient: string | null | undefined): string {
  return `Sent to ${recipient?.trim() || 'WUWF'}.`
}
