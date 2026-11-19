import React from 'react'

import { paragraphs, phoneHref } from '@/lib/page-content'

import { SectionBand } from '../SectionBand'
import { eyebrowClass } from '../parts'
import type { SectionData, SectionProps } from '../types'
import { Form } from './Form'

export interface InquiryFormData extends SectionData {
  contactTitle?: string | null
  submitLabel?: string | null
  sendingLabel?: string | null
  guidelinesNote?: string | null
  guidelinesLink?: string | null
  labels?: { name?: string | null; organization?: string | null; email?: string | null; phone?: string | null; interests?: string | null; budget?: string | null; message?: string | null; required?: string | null } | null
  thanksTitle?: string | null
  thanksPrefix?: string | null
}

const t = (s: string | null | undefined): string => s?.trim() ?? ''

/**
 * Inquiry form. The words are the block's; the choices, the phone and the address are the Sponsorship settings. It reads nothing from the
 * request: the timing token is fetched by the form when it is shown (see `Form.tsx`).
 */
export async function InquiryFormSection({ block }: SectionProps<InquiryFormData>) {
  const { loadSponsorshipSettings } = await import('@/lib/sponsorship/load')
  const { settings, interests, budgets } = await loadSponsorshipSettings()
  const tel = phoneHref(settings.phone)
  const heading = block.heading
  const intro = paragraphs(heading?.intro)
  const l = block.labels
  return (
    <SectionBand block={block}>
      <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <div className="flex flex-col gap-3">
          {t(heading?.eyebrow) && <p className={eyebrowClass}>{heading?.eyebrow}</p>}
          {t(heading?.title) && <h2 className="font-serif text-3xl font-bold leading-tight md:text-4xl">{heading?.title}</h2>}
          {intro.length > 0 && (
            <div className="flex flex-col gap-2 text-lg [color:var(--tone-muted)]">
              {intro.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          )}
          <p className="flex flex-col gap-1 rounded-lg border p-4 text-base [background-color:var(--tone-card)] [border-color:var(--tone-card-rule)]">
            {t(block.contactTitle) && <strong className="block">{block.contactTitle}</strong>}
            {settings.phone && (
              <>
                {tel ? (
                  <a className="font-bold underline [color:var(--tone-accent)]" href={tel}>
                    {settings.phone}
                  </a>
                ) : (
                  settings.phone
                )}
                <br />
              </>
            )}
            {settings.address}
          </p>
        </div>
        <Form
          budgets={budgets}
          copy={{
            submit: t(block.submitLabel) || 'Request a proposal',
            sending: t(block.sendingLabel) || 'Sending',
            thanksTitle: t(block.thanksTitle),
            thanksPrefix: t(block.thanksPrefix),
            notice: t(settings.inquiryNotice),
            guidelinesNote: t(block.guidelinesNote),
            guidelinesLink: t(block.guidelinesLink),
            labels: {
              name: t(l?.name) || 'Name',
              organization: t(l?.organization) || 'Organization',
              email: t(l?.email) || 'Email',
              phone: t(l?.phone) || 'Phone',
              interests: t(l?.interests) || 'Interests',
              budget: t(l?.budget) || 'Budget',
              message: t(l?.message) || 'Message',
              required: t(l?.required) || 'required',
            },
          }}
          interests={interests}
          phone={settings.phone ?? ''}
        />
      </div>
    </SectionBand>
  )
}
