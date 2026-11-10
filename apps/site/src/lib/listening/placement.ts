import type { InlineVariant } from '@/components/Listening/InlineAsk'

import { isPublicId } from './results'

/**
 * Where an editor puts a listening question: in a story's body, or at the end of an episode or video. (The head of a topic
 * page is not a body block: it is a field on the topic.) The editor may paste the question's address from the Portal or the
 * website ("https://…/listens/abcd1234efgh5678") instead of just its code; both mean the same question.
 */
export const PLACEMENT_VARIANTS = ['story', 'voice'] as const satisfies readonly InlineVariant[]
export type PlacementVariant = (typeof PLACEMENT_VARIANTS)[number]

/** The question's public id from what an editor typed: the id itself, or an address ending `/listens/<id>`. Null when neither. */
export function publicIdFromInput(value: string | null | undefined): string | null {
  const text = (value ?? '').trim()
  if (!text) return null
  if (isPublicId(text)) return text
  const match = /\/listens\/([a-z0-9]{16})\/?(?:[?#].*)?$/.exec(text)
  return match?.[1] && isPublicId(match[1]) ? match[1] : null
}

export const PUBLIC_ID_MESSAGE = 'Enter the question’s 16-character code, or paste its address (…/listens/<code>) from the Portal.'

/** A placement variant from stored data; anything unknown reads as the in-story ask. */
export function placementVariant(value: string | null | undefined): PlacementVariant {
  return value === 'voice' ? 'voice' : 'story'
}
