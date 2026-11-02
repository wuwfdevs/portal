import Link from 'next/link'
import React from 'react'

import type { AcknowledgmentLine } from '@/lib/underwriting/resolve'

/**
 * The funder's acknowledgment on a story. It is rendered from the agreement record by the resolver, so the
 * wording here is never typed into a story. Deliberately plain: sans type on a neutral panel, labelled, linked to
 * the independence policy, and never in a sponsor's brand colours, so it reads as disclosure and not advertising.
 * Renders nothing when no agreement applies.
 */
export const Acknowledgment: React.FC<{
  lines: AcknowledgmentLine[]
  /** The hub of the highest-ranked collection that brought an agreement. */
  hubHref?: string | null
  /** The editorial independence policy page, when one is set in Site settings. */
  independenceHref?: string | null
}> = ({ lines, hubHref, independenceHref }) => {
  if (lines.length === 0) return null

  return (
    <aside aria-labelledby="support-heading" className="rounded-sm border border-rule bg-surface-2 p-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-ink-3" id="support-heading">
        Support for this reporting
      </h2>
      <div className="mt-2 flex flex-col gap-2">
        {lines.map((line) => (
          <p className="text-base text-ink" key={line.agreementId}>
            {line.text}
          </p>
        ))}
      </div>
      <p className="mt-3 text-sm text-ink-3">
        Supporters do not choose, review or approve what WUWF reports.
        {(hubHref || independenceHref) && ' '}
        {hubHref && (
          <Link className="font-semibold text-wuwf-blue-700 underline" href={hubHref}>
            About the fellowship
          </Link>
        )}
        {hubHref && independenceHref && ' · '}
        {independenceHref && (
          <Link className="font-semibold text-wuwf-blue-700 underline" href={independenceHref}>
            Our editorial independence policy
          </Link>
        )}
      </p>
    </aside>
  )
}
