import Link from 'next/link'
import React from 'react'

import type { LinkLineBlock as LinkLineBlockProps } from '@/payload-types'

import { cn } from '@/utilities/ui'

import { linkLineTarget } from './target'

/** A label and a link on one line, set apart from the text. No pop-up, no tracking, nothing that moves. */
export const LinkLineBlock: React.FC<LinkLineBlockProps & { className?: string }> = ({ label, newTab, className, ...target }) => {
  const t = linkLineTarget(target)
  if (!t) return null
  const outside = /^(https?:|mailto:)/i.test(t.href)
  const opens = newTab && !target.story ? { target: '_blank', rel: 'noopener noreferrer' } : {}
  const linkClass = 'inline-flex min-h-11 items-center font-bold underline underline-offset-4'
  return (
    <p className={cn('not-prose my-6 border-l-4 border-rule-strong pl-4 font-serif text-lg leading-snug text-ink', className)}>
      {label?.trim() && <span className="mr-2 font-sans text-sm font-bold uppercase tracking-widest text-ink-3">{label.trim()}</span>}
      {outside || newTab ? (
        <a className={linkClass} href={t.href} {...(outside && !opens.rel ? { rel: 'noopener' } : opens)}>
          {t.text}
        </a>
      ) : (
        <Link className={linkClass} href={t.href}>
          {t.text}
        </Link>
      )}
    </p>
  )
}
