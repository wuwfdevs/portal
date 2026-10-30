import Link from 'next/link'
import React from 'react'

import type { Contributor } from '@/payload-types'

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

export const Avatar: React.FC<{ name: string; className?: string }> = ({ name, className }) => (
  <span
    aria-hidden="true"
    className={`inline-flex size-12 shrink-0 items-center justify-center rounded-pill bg-wuwf-blue-100 text-base font-bold text-wuwf-blue-700 ${className ?? ''}`}
  >
    {initialsOf(name)}
  </span>
)

export const AuthorBox: React.FC<{ contributor: Contributor }> = ({ contributor }) => (
  <div className="flex gap-4 border-t border-rule pt-6">
    <Avatar name={contributor.name} />
    <div className="flex flex-col gap-1">
      <p className="text-base font-bold text-ink">{contributor.name}</p>
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
