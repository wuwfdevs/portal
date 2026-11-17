// "Get a proposal" (board 16). Server-side validation of the public inquiry and the email corporate support receives.
// Pure. The site keeps no record of an inquiry: it is mailed to corporate support and nothing else is stored.

import { BUDGETS, INTERESTS } from './content'

export type Inquiry = {
  name: string
  organization: string
  email: string
  phone: string
  interests: string[]
  budget: string
  message: string
}

export type InquiryErrors = Partial<Record<'name' | 'organization' | 'email' | 'phone' | 'interests' | 'budget' | 'message', string>>

export const LIMITS = { name: 120, organization: 160, email: 254, phone: 40, message: 2000 } as const

const EMAIL = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]{2,}$/
/** A phone number: digits with the usual separators, at least seven digits. */
const PHONE = /^[0-9+().\-\s]{7,}$/

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : '')

export type InquiryCheck = { ok: true; value: Inquiry } | { ok: false; errors: InquiryErrors }

/** `raw` is what the form posted: single values as strings, `interests` as a list of strings. Values past a limit are cut, not refused. */
export function validateInquiry(raw: Record<string, unknown>): InquiryCheck {
  const errors: InquiryErrors = {}
  const name = text(raw.name, LIMITS.name)
  const organization = text(raw.organization, LIMITS.organization)
  const email = text(raw.email, LIMITS.email)
  const phone = text(raw.phone, LIMITS.phone)
  const message = text(raw.message, LIMITS.message)
  const budgetRaw = text(raw.budget, 60)
  const budget = budgetRaw === '' ? BUDGETS[0] : budgetRaw

  if (!name) errors.name = 'Tell us your name.'
  if (!organization) errors.organization = 'Tell us the name of your business or organization.'
  if (!email) errors.email = 'Tell us where to send the proposal.'
  else if (!EMAIL.test(email)) errors.email = 'That email address doesn’t look right.'
  if (phone && !PHONE.test(phone)) errors.phone = 'That phone number doesn’t look right.'
  if (!(BUDGETS as readonly string[]).includes(budget)) errors.budget = 'Choose one of the budget ranges, or leave it as it is.'

  const given = Array.isArray(raw.interests) ? raw.interests : typeof raw.interests === 'string' ? [raw.interests] : []
  const interests = [...new Set(given.filter((v): v is string => typeof v === 'string'))]
  if (interests.some((i) => !(INTERESTS as readonly string[]).includes(i))) errors.interests = 'Choose from the list.'

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { name, organization, email, phone, interests, budget, message } }
}

/** "Not sure yet" and "nothing chosen" read the same to a person. */
export const chosenInterests = (interests: readonly string[]): string => (interests.length > 0 ? interests.join(', ') : 'nothing in particular yet')

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** The message corporate support receives. The sender's address is the reply-to; the subject carries no line breaks. */
export function inquiryEmail(value: Inquiry): { subject: string; text: string; replyTo: string } {
  const lines = [
    `Name: ${value.name}`,
    `Organization: ${value.organization}`,
    `Email: ${value.email}`,
    `Phone: ${value.phone || 'not given'}`,
    `Interested in: ${chosenInterests(value.interests)}`,
    `Budget: ${value.budget}`,
    '',
    "What's happening at their business:",
    value.message || '(nothing written)',
    '',
    'Sent from the sponsorship page on wuwf.org. The site keeps no copy of this message.',
  ]
  return { subject: `Sponsorship inquiry: ${oneLine(value.organization)}`, text: lines.join('\n'), replyTo: value.email }
}
