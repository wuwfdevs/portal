import Link from 'next/link'
import React from 'react'

import type { RelatedStoryBlock as RelatedStoryBlockProps } from '@/payload-types'

import { cn } from '@/utilities/ui'

import { relatedStoryTarget } from './target'

export const RelatedStoryBlock: React.FC<RelatedStoryBlockProps & { className?: string }> = ({ label, newTab, className, ...target }) => {
  const t = relatedStoryTarget(target)
  if (!t) return null
  const external = /^https?:\/\//i.test(t.href)
  const opens = newTab && !target.story ? { target: '_blank', rel: 'noopener noreferrer' } : {}
  return (
    <p className={cn('not-prose my-6 border-l-4 border-rule-strong pl-4 font-serif text-lg leading-snug text-ink', className)}>
      <span className="mr-2 font-sans text-sm font-bold uppercase tracking-widest text-ink-3">{label || 'Related'}</span>
      {external || newTab ? (
        <a className="font-bold underline underline-offset-4" href={t.href} {...opens}>
          {t.headline}
        </a>
      ) : (
        <Link className="font-bold underline underline-offset-4" href={t.href}>
          {t.headline}
        </Link>
      )}
    </p>
  )
}
