import React from 'react'

import { supportHref } from '@/lib/support-link'

import { AppealWatch } from '@/components/Analytics/AppealWatch'
import { CtaCard } from '@/components/Kit'
import { SectionBand } from '../SectionBand'
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

/** Support: a call to action drawn as a card (`CtaCard`). Draws nothing without a title or without a safe form address; never asks for or shows an amount, card or bank detail. */
export async function SupportSection({ block, context }: SectionProps<SupportData>) {
  const title = block.heading?.title?.trim()
  if (!title) return null
  const href = await donationFormAddress(context.show?.id ?? null)
  if (!href) return null
  return (
    <SectionBand block={{ ...block, tone: 'plain' }}>
      <AppealWatch className="h-full" kind="support" surface="section">
      <CtaCard
        actions={[{ label: block.label?.trim() || 'Become a member', href }]}
        eyebrow={block.heading?.eyebrow?.trim()}
        intro={block.heading?.intro?.trim()}
        note={block.note?.trim()}
        title={title}
        tone={block.tone}
      />
      </AppealWatch>
    </SectionBand>
  )
}
