import React from 'react'

import { fill, mailHref, phoneHref } from '@/lib/page-content'
import { givingNavItems, givingNavTitle } from '@/lib/giving/nav'
import type { GivingContent } from '@/lib/giving/content'
import type { GivingPage } from '@/lib/giving/paths'

import { ButtonLink, textLink, type ButtonVariant } from '../PageParts'
import { SectionNav } from '../SectionNav'

/** Shared pieces of the giving pages (boards 14 to 14d). Server components; the interactive ones sit beside this file. */

/**
 * The strip under the header and the closing line every giving page ends with. `current` marks the page in the strip; null leaves the
 * strip off (the thank-you page is where a gift ends, not a place to browse from).
 */
export const GivingShell: React.FC<{ current: GivingPage | null; content: GivingContent; children: React.ReactNode }> = ({ current, content, children }) => (
  <>
    {current && <SectionNav className="bg-surface-2" items={givingNavItems(current, content.nav)} label={givingNavTitle(content.nav)} />}
    <div className="flex-1">{children}</div>
    {content.serviceLine?.trim() && (
      <footer className="border-t border-rule bg-surface-2">
        <p className="container py-6 text-sm text-ink-2">{content.serviceLine}</p>
      </footer>
    )}
  </>
)

/** Call and Email buttons from Member Services' number and address. A button with no number or address is not drawn. */
export const ContactActions: React.FC<{
  content: GivingContent
  callLabel?: string | null
  emailLabel?: string | null
  call?: ButtonVariant
  email?: ButtonVariant
}> = ({ content, callLabel, emailLabel, call = 'primary', email = 'outline' }) => (
  <>
    <ButtonLink href={phoneHref(content.phone)} label={callLabel?.trim() ? fill(callLabel, { phone: content.phone ?? '' }) : null} variant={call} />
    <ButtonLink href={mailHref(content.email)} label={emailLabel} variant={email} />
  </>
)

/** Admin text that says where the phone number goes with `{phone}`; the number becomes a telephone link (plain text when it cannot be one). */
export const WithPhone: React.FC<{ template: string; phone: string | null | undefined }> = ({ template, phone }) => {
  const tel = phoneHref(phone)
  const pieces = template.split('{phone}')
  return (
    <>
      {pieces.map((piece, i) => (
        <React.Fragment key={i}>
          {piece}
          {i < pieces.length - 1 &&
            (tel ? (
              <a className={`${textLink} inline-flex min-h-11 items-center`} href={tel}>
                {phone}
              </a>
            ) : (
              phone
            ))}
        </React.Fragment>
      ))}
    </>
  )
}
