import Link from 'next/link'
import React from 'react'

import type { Contributor, Media as MediaDoc } from '@/payload-types'

import { CtaCard } from '@/components/Kit'
import { Media } from '@/components/Media'
import { initialsOf } from '@/lib/format'
import { listHref } from '@/lib/lists/route'
import type { MembershipAppeal as MembershipAppealWords } from '@/lib/shared-text'

export const Chip: React.FC<{ children: React.ReactNode; href?: string; tone?: 'teal' | 'plain' }> = ({ children, href, tone = 'plain' }) => {
  const cls =
    tone === 'teal'
      ? 'bg-wuwf-teal text-surface'
      : 'border border-rule-strong bg-surface text-ink-2'
  const base = `inline-flex min-h-7 items-center rounded-pill px-3 text-xs font-bold uppercase tracking-widest ${cls}`
  return href ? (
    <Link className={`${base} hover:no-underline`} href={href}>
      {children}
    </Link>
  ) : (
    <span className={base}>{children}</span>
  )
}

/** A story's topics, as quiet links to each topic's page. Draws nothing for none, and no link for a topic with no slug. */
export const TopicLinks: React.FC<{ topics: readonly { id: string | number; title: string; slug?: string | null }[] }> = ({ topics }) => {
  const shown = topics.filter((t) => t.title.trim() !== '')
  if (shown.length === 0) return null
  return (
    <nav aria-label="Topics" className="flex flex-wrap items-center gap-x-5 border-t border-rule pt-4">
      <span className="text-xs font-bold uppercase tracking-widest text-ink-3">Filed under</span>
      {shown.map((t) =>
        t.slug ? (
          <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink" href={listHref('topic', t.slug)} key={t.id}>
            {t.title}
          </Link>
        ) : (
          <span className="inline-flex min-h-11 items-center text-sm text-ink-2" key={t.id}>
            {t.title}
          </span>
        ),
      )}
    </nav>
  )
}

/**
 * An author's picture: their photo when they have one (the same `photo` their profile page shows), else their initials.
 * `photo` must be a loaded media record, not an id.
 */
export const Avatar: React.FC<{ name: string; initials?: string | null; photo?: MediaDoc | null; className?: string }> = ({ name, initials, photo, className }) =>
  photo ? (
    <span aria-hidden="true" className={`inline-block size-12 shrink-0 overflow-hidden rounded-pill bg-surface-3 ${className ?? ''}`}>
      <Media className="size-full" imgClassName="size-full object-cover" pictureClassName="block size-full" resource={photo} size="96px" />
    </span>
  ) : (
    <span
      aria-hidden="true"
      className={`inline-flex size-12 shrink-0 items-center justify-center rounded-pill bg-wuwf-blue-100 text-base font-bold text-wuwf-blue-700 ${className ?? ''}`}
    >
      {initials || initialsOf(name)}
    </span>
  )

export const AuthorBox: React.FC<{ contributor: Contributor; photo?: MediaDoc | null }> = ({ contributor, photo }) => (
  <div className="flex gap-4 border-t border-rule pt-6">
    <Avatar initials={contributor.initials} name={contributor.name} photo={photo} />
    <div className="flex flex-col gap-1">
      <p className="text-base font-bold text-ink">
        {contributor.slug ? <Link href={`/people/${contributor.slug}`}>{contributor.name}</Link> : contributor.name}
      </p>
      {contributor.title && <p className="text-sm text-ink-3">{contributor.title}</p>}
      {contributor.bio && <p className="mt-1 text-base text-ink-2">{contributor.bio}</p>}
    </div>
  </div>
)

/**
 * The membership appeal. Its words are the Shared text global's (`membershipAppealOf`); with none, it is not drawn. It is the site's call-to-action card (`Kit/CtaCard`), the same one Support and
 * Closing band draw, as wide as the place it sits in. It sets its own page theme because a story page has none, and the card's tone rules are written under one.
 */
export const MembershipAppeal: React.FC<{ appeal: MembershipAppealWords | null }> = ({ appeal }) => {
  if (!appeal) return null
  return (
    <aside aria-label="Support WUWF" data-page-theme="wuwf">
      <CtaCard actions={appeal.button ? [appeal.button] : []} as="p" size="md" title={appeal.text} tone="plain" />
    </aside>
  )
}
