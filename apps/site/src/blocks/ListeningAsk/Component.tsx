import React from 'react'

import type { ListeningAskBlock as ListeningAskBlockProps } from '@/payload-types'

import { ListeningInline } from '@/components/Listening/ListeningInline'
import { placementVariant, publicIdFromInput } from '@/lib/listening/placement'

/** Places one listening question where an editor put it. A server component: it reads the question from the Portal. */
export const ListeningAskBlock: React.FC<ListeningAskBlockProps> = ({ question, variant, recipient, description }) => {
  const publicId = publicIdFromInput(question)
  if (!publicId) return null
  const kind = placementVariant(variant)
  return (
    <div className="not-prose my-8">
      <ListeningInline
        description={kind === 'voice' ? description?.trim() || undefined : undefined}
        publicId={publicId}
        recipient={kind === 'voice' ? recipient?.trim() || undefined : undefined}
        variant={kind}
      />
    </div>
  )
}
