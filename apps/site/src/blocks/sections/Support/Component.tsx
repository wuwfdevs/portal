import React from 'react'

import { supportHref } from '@/lib/support-link'

import { SectionBand } from '../SectionBand'
import { SectionActions } from '../parts'
import type { SectionData, SectionProps } from '../types'

export interface SupportData extends SectionData {
  label?: string | null
  note?: string | null
}

/**
 * The donation form's address, from the Giving settings through the cache tag (`global_giving-settings`): a save in the admin refreshes
 * every page holding this block. Loaded when the block is drawn, not when the registry is read (the registry is imported by the Payload
 * config, which cannot load the global helper). A failed read is "no address", and the block draws nothing.
 */
async function donationFormAddress(showId: number | string | null): Promise<string | null> {
  try {
    // A page that speaks for a show gives to that show: the production's own form address, with its attribution code. Without one it is the station's form, as everywhere else.
    if (showId !== null) {
      const { loadShowDonationHref } = await import('@/lib/shows/support-load')
      const own = await loadShowDonationHref(showId)
      if (own) return own
    }
    const { getCachedGlobal } = await import('@/utilities/getGlobals')
    const page = (await getCachedGlobal('giving-settings', 0)()) as { donationForm?: { monthlyAddress?: string | null } | null } | null
    return supportHref(page?.donationForm?.monthlyAddress)
  } catch {
    return null
  }
}

/** Support. Draws nothing without a title or without a safe form address; never asks for or shows an amount, card or bank detail. */
export async function SupportSection({ block, context }: SectionProps<SupportData>) {
  const title = block.heading?.title?.trim()
  if (!title) return null
  const href = await donationFormAddress(context.show?.id ?? null)
  if (!href) return null
  const eyebrow = block.heading?.eyebrow?.trim()
  const intro = block.heading?.intro?.trim()
  const note = block.note?.trim()
  return (
    <SectionBand block={block}>
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-12">
        <div className="flex max-w-2xl flex-col gap-2">
          {eyebrow && <p className="text-sm font-bold uppercase tracking-wider [color:var(--tone-muted)]">{eyebrow}</p>}
          <h2 className="font-serif text-3xl font-bold leading-tight md:text-4xl">{title}</h2>
          {intro && <p className="text-lg">{intro}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2">
          <SectionActions actions={[{ label: block.label?.trim() || 'Become a member', href }]} />
          {note && <p className="text-sm [color:var(--tone-muted)]">{note}</p>}
        </div>
      </div>
    </SectionBand>
  )
}
