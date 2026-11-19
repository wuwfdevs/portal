import React from 'react'

import { DonateCard } from '@/components/Giving/DonateCard'
import { donateConfigOf, type GiftCardWords } from '@/lib/giving/content'
import { buildDonateModel } from '@/lib/giving/donate'
import { paragraphs, phoneHref, textsOf } from '@/lib/page-content'

import { SectionBand } from '../SectionBand'
import { WithTokens } from '../giving-parts'
import { eyebrowClass } from '../parts'
import type { SectionData, SectionProps } from '../types'

export interface GiftCardData extends SectionData {
  label?: string | null
  headline?: string | null
  line?: string | null
  assurances?: Array<{ id?: string | null; text?: string | null } | null> | null
  card?: (NonNullable<GiftCardWords> & { noteWithPrefill?: string | null; noteWithoutPrefill?: string | null }) | null
}

/**
 * Gift card. Draws nothing without a headline. With no amounts in the Giving settings the words draw alone; with amounts but no donation form
 * address the card says to call (the number is the settings'), and no Give button is drawn. It never asks for or shows a card, bank or payroll detail.
 */
export async function GiftCardSection({ block }: SectionProps<GiftCardData>) {
  const headline = block.headline?.trim()
  if (!headline) return null
  const { loadGivingSettings } = await import('@/lib/giving/load')
  const settings = await loadGivingSettings()
  const config = donateConfigOf(settings, block.card)
  const frequencies = config ? buildDonateModel(config) : []
  // The note under the button must not promise an amount "already chosen" unless the form really takes it from the link.
  const note = (settings.donationForm?.prefill ? block.card?.noteWithPrefill : block.card?.noteWithoutPrefill)?.trim() || null
  const lines = paragraphs(block.line)
  const assurances = textsOf(block.assurances, 'text')
  const label = block.label?.trim()
  const unavailable = (
    <p className="rounded-sm bg-surface-2 p-4 text-[0.9375rem] text-ink-2">
      <WithTokens template={settings.donationForm?.notSetUp?.trim() || 'To give today, call {phone}.'} tokens={{ phone: { text: settings.phone?.trim(), href: phoneHref(settings.phone) } }} />
    </p>
  )

  const words = (
    <div className="flex min-w-0 flex-col items-start gap-4">
      {label && <p className={eyebrowClass}>{label}</p>}
      <h1 className="max-w-3xl font-serif text-4xl font-bold leading-[1.05] tracking-tight md:text-[3.25rem]">{headline}</h1>
      {lines.length > 0 && (
        <div className="flex max-w-3xl flex-col gap-3 text-lg md:text-[1.1875rem] md:leading-normal">
          {lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      )}
      {assurances.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-[0.9375rem]">
          {assurances.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <SectionBand block={block}>
      {frequencies.length > 0 ? (
        <div className="grid items-start gap-8 lg:grid-cols-[1.2fr_1fr] lg:gap-14">
          {words}
          <DonateCard frequencies={frequencies} note={note} unavailable={unavailable} />
        </div>
      ) : (
        words
      )}
    </SectionBand>
  )
}
