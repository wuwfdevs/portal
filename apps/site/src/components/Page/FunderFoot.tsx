import React from 'react'

import { Acknowledgment } from '@/components/Acknowledgment'

/**
 * The funder line, drawn by the page's set under its last section (hubs redesign, 2026-11-23): a show's or a hub's underwriting agreements, on the neutral panel with the link to
 * the editorial independence policy. It is the set's foot and not a block, so an editor cannot delete it, move it or put it on a page twice, and the wording is never typed on a page:
 * it is the agreements' own (`lib/underwriting/resolve`), only those whose term is running, read on the server. It names the production the page speaks for (`pages.show`).
 * Draws nothing without a production, without a running agreement, or when the read fails (the page is still drawn).
 */
export async function FunderFoot({ productionId }: { productionId: string | number | null | undefined }) {
  if (productionId === null || productionId === undefined) return null
  const { loadCredit } = await import('@/lib/section-data/load')
  const credit = await loadCredit({ relationTo: 'productions', id: productionId }).catch((error: unknown) => {
    console.error('The funder line could not be loaded and is left out.', error)
    return null
  })
  if (!credit) return null
  return <FunderFootView credit={credit} />
}

/** The foot itself, from what the loader returned (tested with fixtures). */
export function FunderFootView({ credit }: { credit: { lines: React.ComponentProps<typeof Acknowledgment>['lines']; independenceHref: string | null } }) {
  if (credit.lines.length === 0) return null
  return (
    <section aria-label="Funding" className="bg-surface">
      <div className="container pb-12 md:pb-14">
        <div className="mx-auto max-w-[54rem]">
          <Acknowledgment headingId="funder-foot-heading" independenceHref={credit.independenceHref} lines={credit.lines} subject="program" />
        </div>
      </div>
    </section>
  )
}
