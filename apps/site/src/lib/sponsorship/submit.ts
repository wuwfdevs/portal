// Handing a public inquiry to corporate support. Pure over its inputs (the mailer and the clock are passed in), so every outcome is tested.
// The site stores nothing: the inquiry is validated, mailed and forgotten. Never log what was sent.

import { checkFormToken, honeypotClean } from '@/lib/events/abuse'
import type { Mailer } from '@/lib/email/mailer'

import { chosenInterests, inquiryEmail, validateInquiry, type InquiryChoices, type InquiryErrors } from './inquiry'

export type InquiryOutcome =
  | { kind: 'ok'; chosen: string }
  | { kind: 'invalid'; errors: InquiryErrors }
  | { kind: 'form-expired' }
  | { kind: 'too-fast' }
  | { kind: 'not-set-up' }
  | { kind: 'failed' }

export async function processInquiry(
  input: { raw: Record<string, unknown>; token: unknown; honeypot: unknown; now: Date },
  deps: { tokenSecret: string; recipient: string | null; choices: InquiryChoices; mailer: Mailer },
): Promise<InquiryOutcome> {
  // A filled honeypot is a bot: answer as if it worked and send nothing.
  if (!honeypotClean(input.honeypot)) return { kind: 'ok', chosen: 'nothing in particular yet' }

  const token = checkFormToken(input.token, input.now, deps.tokenSecret)
  if (!token.ok) return token.reason === 'too-fast' ? { kind: 'too-fast' } : { kind: 'form-expired' }

  const check = validateInquiry(input.raw, deps.choices)
  if (!check.ok) return { kind: 'invalid', errors: check.errors }

  if (!deps.recipient || !deps.mailer.isConfigured()) return { kind: 'not-set-up' }
  const mail = inquiryEmail(check.value)
  const sent = await deps.mailer.send({ to: deps.recipient, subject: mail.subject, text: mail.text, replyTo: mail.replyTo })
  return sent.ok ? { kind: 'ok', chosen: chosenInterests(check.value.interests) } : { kind: 'failed' }
}

/**
 * The timing token the form should send next after a refused attempt. An expired form gets a fresh one; every other refusal keeps the
 * token that was just submitted (it is still valid), so a fresh token is never lost to a later "too fast" or "invalid" answer.
 */
export function tokenAfterRefusal(kind: InquiryOutcome['kind'], submitted: unknown, fresh: () => string): string | undefined {
  if (kind === 'form-expired') return fresh()
  return typeof submitted === 'string' && submitted !== '' ? submitted : undefined
}
