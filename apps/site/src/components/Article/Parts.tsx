import Link from 'next/link'
import React from 'react'

import type { Contributor, Media as MediaDoc } from '@/payload-types'

import { Media } from '@/components/Media'
import { initialsOf } from '@/lib/format'

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

/**
 * An author's picture: their photo when they have one (the same `photo` their profile page shows), else their initials.
 * `photo` must be a loaded media record, not an id.
 */
export const Avatar: React.FC<{ name: string; initials?: string | null; photo?: MediaDoc | null; className?: string }> = ({ name, initials, photo, className }) =>
  photo ? (
    <span aria-hidden="true" className={`inline-block size-12 shrink-0 overflow-hidden rounded-pill bg-surface-3 ${className ?? ''}`}>
      <Media imgClassName="size-full object-cover" resource={photo} size="96px" />
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

export const MembershipAppeal: React.FC = () => (
  <aside aria-label="Support WUWF" className="flex flex-col gap-3 rounded-sm bg-wuwf-blue-100 p-6 md:flex-row md:items-center md:justify-between">
    <p className="font-serif text-xl font-bold text-ink">Reporting like this takes weeks on one street. Members make it possible.</p>
    <Link
      className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-sm bg-wuwf-blue-700 px-6 text-base font-bold text-surface hover:bg-wuwf-blue-600 hover:no-underline"
      href="/support"
    >
      Become a member
    </Link>
  </aside>
)
