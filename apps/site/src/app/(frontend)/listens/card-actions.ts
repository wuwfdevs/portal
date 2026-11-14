'use server'

import { LISTENING_PATHS } from '@wuwf/portal-contracts'

import { checkCard } from '@/lib/listening/card'
import { callListening } from '@/lib/listening/portal'
import { currentClientHash, currentVisitorSubject } from '@/lib/listening/request-context'
import { failure, type ActionResult } from '@/lib/listening/results'
import { isTableLinkToken } from '@/lib/listening/table-token'

/**
 * Board 5i: one person's contact card, on their own phone, tied to the table by the second QR code's token. The person is this
 * visitor: one card each, however many phones pass the table. What is sent is checked and picked by name; the Portal checks
 * again, and only WUWF staff ever read the card (the facilitator learns a count).
 */
export async function saveContactCard(input: {
  cardToken: string
  firstName: string
  contact: string
  mayContact: boolean
  mayName: boolean
  keepAnonymous: boolean
}): Promise<ActionResult<{ warning: string | null }>> {
  if (!isTableLinkToken(input.cardToken)) return failure('invalid_request')
  if (typeof input.firstName !== 'string' || typeof input.contact !== 'string') return failure('invalid_request')
  if (typeof input.mayContact !== 'boolean' || typeof input.mayName !== 'boolean' || typeof input.keepAnonymous !== 'boolean') return failure('invalid_request')

  const checked = checkCard(input)
  if (!checked.ok) return { ...failure('invalid_request'), message: checked.message }

  const subject = await currentVisitorSubject(true)
  if (!subject) return failure('unavailable')
  const hash = await currentClientHash()
  const { firstName, contact, mayContact, mayName, keepAnonymous } = checked.value
  const result = await callListening<Record<never, never>>(LISTENING_PATHS.contactCardSave, {
    cardToken: input.cardToken,
    subject,
    firstName,
    contact,
    mayContact,
    mayName,
    keepAnonymous,
    ...(hash ? { clientHash: hash } : {}),
  })
  return result.ok ? { ok: true, warning: checked.warning } : failure(result.error)
}
