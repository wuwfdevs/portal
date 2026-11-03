import Link from 'next/link'
import React from 'react'

/** A category link that looks like the site's chips but is 44px tall to touch, as links in a list should be. */
export function ChipLink({ href, children, tone = 'plain' }: { href: string; children: React.ReactNode; tone?: 'teal' | 'plain' }) {
  const cls = tone === 'teal' ? 'bg-wuwf-teal text-surface' : 'border border-rule-strong bg-surface text-ink-2'
  return (
    <Link className={`inline-flex min-h-11 items-center rounded-pill px-3 text-xs font-bold uppercase tracking-widest hover:no-underline ${cls}`} href={href}>
      {children}
    </Link>
  )
}
