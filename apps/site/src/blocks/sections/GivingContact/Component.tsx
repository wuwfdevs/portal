import React from 'react'

import { ButtonLink } from '@/components/PageParts'
import { fill, mailHref, paragraphs, phoneHref } from '@/lib/page-content'

import { SectionBand } from '../SectionBand'
import { WithTokens } from '../giving-parts'
import { SectionActions, eyebrowClass } from '../parts'
import type { SectionData, SectionProps } from '../types'

export interface GivingContactData extends SectionData {
  label?: string | null
  headline?: string | null
  line?: string | null
  cardTitle?: string | null
  cardText?: string | null
  cardNote?: string | null
  callLabel?: string | null
  emailLabel?: string | null
}

/** Giving contact. The number and address come from the Giving settings; a button needs both its words and its number or address. */
export async function GivingContactSection({ block }: SectionProps<GivingContactData>) {
  const { loadGivingSettings } = await import('@/lib/giving/load')
  const settings = await loadGivingSettings()
  const phone = settings.phone?.trim() ?? ''
  const email = settings.email?.trim() ?? ''
  const tel = phoneHref(phone)
  const mail = mailHref(email)
  const lines = paragraphs(block.line)

  if (block.variant === 'line') {
    const sentence = block.line?.trim()
    if (!sentence) return null
    return (
      <SectionBand block={block}>
        <p className="text-sm [color:var(--tone-muted)]">
          <WithTokens template={sentence} tokens={{ phone: { text: phone, href: tel }, email: { text: email, href: mail } }} />
        </p>
      </SectionBand>
    )
  }

  const headline = block.headline?.trim()
  if (!headline) return null
  const callLabel = block.callLabel?.trim() ? fill(block.callLabel, { phone }) : null
  const emailLabel = block.emailLabel?.trim() || null
  const actions = [
    ...(tel && callLabel ? [{ label: callLabel, href: tel }] : []),
    ...(mail && emailLabel ? [{ label: emailLabel, href: mail }] : []),
  ]

  if (block.variant === 'band') {
    return (
      <SectionBand block={block}>
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-12">
          <div className="flex max-w-[44rem] flex-col gap-3">
            <h2 className="font-serif text-3xl font-bold leading-tight md:text-4xl">{headline}</h2>
            {lines.map((l) => (
              <p className="text-lg" key={l}>
                {l}
              </p>
            ))}
          </div>
          <SectionActions actions={actions} className="shrink-0" />
        </div>
      </SectionBand>
    )
  }

  // Hero: the words beside a light card (a self-contained panel, in the same colours on every tone).
  const cardTitle = block.cardTitle?.trim()
  const card = cardTitle ? (
    <div className="flex flex-col gap-3 rounded-md bg-surface p-7 text-ink">
      <strong className="font-serif text-2xl leading-tight">{cardTitle}</strong>
      {block.cardText?.trim() && <span className="text-base text-ink-2">{block.cardText}</span>}
      {(phone || email) && (
        <div className="flex flex-col gap-1 text-base">
          {phone && <strong>{phone}</strong>}
          {(email || block.cardNote?.trim()) && <span className="text-ink-3">{[email, block.cardNote?.trim()].filter(Boolean).join('. ')}</span>}
        </div>
      )}
      <div className="flex flex-wrap gap-2.5">
        <ButtonLink href={tel} label={callLabel} />
        <ButtonLink href={mail} label={emailLabel} variant="outline" />
      </div>
    </div>
  ) : null
  const label = block.label?.trim()
  const words = (
    <div className="flex min-w-0 flex-col items-start gap-4">
      {label && <p className={eyebrowClass}>{label}</p>}
      <h1 className="max-w-3xl font-serif text-4xl font-bold leading-[1.05] tracking-tight md:text-[3.25rem]">{headline}</h1>
      {lines.map((l) => (
        <p className="max-w-3xl text-lg md:text-[1.1875rem] md:leading-normal" key={l}>
          {l}
        </p>
      ))}
    </div>
  )
  return <SectionBand block={block}>{card ? <div className="grid items-start gap-8 lg:grid-cols-[1.35fr_1fr] lg:gap-14">{words}{card}</div> : words}</SectionBand>
}
