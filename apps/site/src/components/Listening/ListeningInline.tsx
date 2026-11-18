import React from 'react'

import type { ListeningPlacement } from '@/lib/listening/inline'
import { loadPlacedQuery } from '@/lib/listening/load'

import { QuestionSet } from './QuestionSet'

/**
 * Places ONE listening component on a page (the rule: one per page): the query's full question set, the same screens and rules as
 * `/listens/<publicId>`, framed for where it sits (`QuestionSet`'s `placement`):
 *   - `story`: in a story's body;
 *   - `topic`: at the head of a topic page, as an invitation that opens in place, with what came of the question underneath;
 *   - `voice`: after an episode or video, leading with recording and naming who receives it.
 * It shows nothing at all when the question is closed, not available, has no questions, or listening is not set up. A page must
 * not break, or show an error, because a question closed.
 *
 * Placed by the `listeningAsk` story block, and by a topic's own question field.
 */
export const ListeningInline: React.FC<{
  publicId: string
  variant: Exclude<ListeningPlacement, 'page'>
  recipient?: string
  description?: string
}> = async ({ publicId, variant, recipient, description }) => {
  const query = await loadPlacedQuery(publicId)
  // The full set opens on its first question, so a query with none has nothing to show.
  if (!query || query.state !== 'open' || query.questions.length === 0) return null

  return (
    <>
      <QuestionSet description={description} placement={variant} query={query} recipient={recipient} />
      {variant === 'topic' && query.outcome && (
        <p className="mt-3 max-w-2xl text-sm text-ink-2">
          You asked, we reported:{' '}
          <a className="font-bold" href={query.outcome.url} rel="noopener">
            {query.outcome.title}
          </a>
        </p>
      )}
    </>
  )
}
