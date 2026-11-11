import React from 'react'

import { inlineQuestion } from '@/lib/listening/inline'
import { loadPlacedQuery } from '@/lib/listening/load'

import { InlineAsk, type InlineVariant } from './InlineAsk'
import { Invite } from './Invite'

/**
 * Places ONE listening component on a page (the rule: one per page). It reads the question from the Portal and shows:
 *   - the inline ask (B in a story, C at the head of a topic page, D after an episode) when the question can be answered
 *     there, else the invitation (A) to the full question set;
 *   - nothing at all when the question is closed, not available, or listening is not set up. A story must not break, or
 *     show an error, because a question closed.
 *
 * Placed by the `listeningAsk` story block, and by a topic's own question field.
 */
export const ListeningInline: React.FC<{
  publicId: string
  variant: InlineVariant
  recipient?: string
  description?: string
}> = async ({ publicId, variant, recipient, description }) => {
  const query = await loadPlacedQuery(publicId)
  if (!query || query.state !== 'open') return null

  const fullSetHref = `/listens/${query.publicId}`
  const question = inlineQuestion(query)
  if (!question) return <Invite href={fullSetHref} query={query} />

  return (
    <InlineAsk
      description={description}
      fullSetHref={fullSetHref}
      hubHref="/listens"
      query={query}
      question={question}
      recipient={recipient}
      variant={variant}
    />
  )
}
