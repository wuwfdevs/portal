import React from 'react'

import type { ListeningAskBlock as ListeningAskBlockProps } from '@/payload-types'

import { ListeningInline } from '@/components/Listening/ListeningInline'
import { effectiveVariant, publicIdFromInput, type PlacementVariant } from '@/lib/listening/placement'

/**
 * Places one listening query where an editor put it. A server component: it reads the query from the Portal. How it is framed comes from the story it sits in
 * (`framing`: an audio or video story leads with recording), unless the block was saved as `voice` before the editor stopped being asked. The optional recipient and
 * description are drawn whichever way it is framed.
 */
export const ListeningAskBlock: React.FC<ListeningAskBlockProps & { framing?: PlacementVariant }> = ({ question, variant, recipient, description, framing }) => {
  const publicId = publicIdFromInput(question)
  if (!publicId) return null
  return (
    <div className="not-prose my-8">
      <ListeningInline
        description={description?.trim() || undefined}
        publicId={publicId}
        recipient={recipient?.trim() || undefined}
        variant={effectiveVariant(variant, framing)}
      />
    </div>
  )
}
