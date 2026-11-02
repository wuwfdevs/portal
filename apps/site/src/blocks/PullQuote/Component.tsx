import React from 'react'

import type { PullQuoteBlock as PullQuoteBlockProps } from '@/payload-types'

import { Media } from '@/components/Media'
import { cn } from '@/utilities/ui'

export const PullQuoteBlock: React.FC<PullQuoteBlockProps & { className?: string }> = ({ text, attribution, image, className }) => (
  <figure className={cn('not-prose my-10 flex gap-5 border-y border-rule-strong py-6', className)}>
    {image && typeof image === 'object' && (
      <div className="hidden w-28 shrink-0 sm:block">
        <Media imgClassName="rounded-pill" resource={image} />
      </div>
    )}
    <div className="flex flex-col gap-3">
      <blockquote className="font-serif text-2xl font-bold leading-snug text-ink md:text-3xl">{text}</blockquote>
      {attribution && <figcaption className="font-sans text-sm font-bold uppercase tracking-widest text-ink-3">{attribution}</figcaption>}
    </div>
  </figure>
)
