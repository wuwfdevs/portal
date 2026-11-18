import React from 'react'

import { inlineEyebrow, inlineQuestion } from '@/lib/listening/inline'
import { loadPlacedQuery } from '@/lib/listening/load'
import { cn } from '@/utilities/ui'

import { InlineAsk, type InlineVariant } from './InlineAsk'
import { Invite } from './Invite'
import { QuestionSet } from './QuestionSet'
import { eyebrow } from './styles'

/**
 * Places ONE listening component on a page (the rule: one per page). It reads the question from the Portal and shows:
 *   - in a story (`story`): the full question set, the same screens and rules as `/listens/<publicId>`, every question and every
 *     detail the query asks for;
 *   - at the head of a topic page (`topic`) or after an episode (`voice`): the one-question inline ask when the question can be
 *     answered there, else the invitation (A) to the full question set;
 *   - nothing at all when the question is closed, not available, or listening is not set up. A story must not break, or
 *     show an error, because a question closed.
 *
 * Placed by the `listeningAsk` story block, and by a topic's own question field.
 */
export const ListeningInline: React.FC<{
  publicId: string
  variant: 'story' | InlineVariant
  recipient?: string
  description?: string
}> = async ({ publicId, variant, recipient, description }) => {
  const query = await loadPlacedQuery(publicId)
  if (!query || query.state !== 'open') return null

  if (variant === 'story') {
    // The full set reads its first question; a query with none has nothing to show.
    if (query.questions.length === 0) return null
    return (
      <section aria-label="WUWF Listens" className="flex flex-col gap-3">
        <span className={cn(eyebrow, 'mx-auto w-full max-w-xl')}>
          {inlineEyebrow(query)}
          {query.askedBy ? ` · asked by ${query.askedBy}` : ''}
        </span>
        <QuestionSet embedded query={query} />
      </section>
    )
  }

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
