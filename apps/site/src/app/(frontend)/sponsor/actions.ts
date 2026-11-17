'use server'

import { HONEYPOT_FIELD, TOKEN_FIELD } from '@/lib/events/abuse'
import { mailer } from '@/lib/email/mailer'
import { inquiryRecipient, inquiryTokenFor, inquiryTokenSecret } from '@/lib/sponsorship/secrets'
import { processInquiry } from '@/lib/sponsorship/submit'

export interface InquiryState {
  status: 'idle' | 'ok' | 'error'
  message?: string
  errors?: Record<string, string>
  /** What the visitor typed, so a refused form comes back filled in. */
  values?: Record<string, string | string[]>
  /** What they said they were interested in, for the thank-you. */
  chosen?: string
  /** A fresh timing token when the old one can no longer be used. */
  token?: string
}

const MAX_VALUE = 5_000

export async function submitInquiry(_previous: InquiryState, formData: FormData): Promise<InquiryState> {
  const raw: Record<string, string | string[]> = {}
  for (const name of ['name', 'organization', 'email', 'phone', 'budget', 'message']) {
    const value = formData.get(name)
    raw[name] = typeof value === 'string' ? value.slice(0, MAX_VALUE) : ''
  }
  raw.interests = formData.getAll('interests').filter((v): v is string => typeof v === 'string').slice(0, 20)
  const token = formData.get(TOKEN_FIELD)
  const honeypot = formData.get(HONEYPOT_FIELD)

  const outcome = await processInquiry(
    { raw, token: typeof token === 'string' ? token : undefined, honeypot: typeof honeypot === 'string' ? honeypot : undefined, now: new Date() },
    { tokenSecret: inquiryTokenSecret(), recipient: inquiryRecipient(), mailer: mailer() },
  ).catch(() => null)

  switch (outcome?.kind) {
    case 'ok':
      return { status: 'ok', chosen: outcome.chosen }
    case 'invalid':
      return { status: 'error', message: 'Some answers need another look. They are marked below.', errors: outcome.errors, values: raw }
    case 'form-expired':
      return { status: 'error', message: 'This form was open for a long time, so it needs to be sent again. Your answers are kept. Press Request a proposal once more.', values: raw, token: inquiryTokenFor() }
    case 'too-fast':
      return { status: 'error', message: 'That was very quick. Please check your answers, then press Request a proposal again.', values: raw }
    case 'not-set-up':
      return { status: 'error', message: 'Online requests are not set up yet, so nothing was sent. Please call corporate support at 850 473-7453.', values: raw }
    default:
      return { status: 'error', message: 'Something went wrong on our side and your request was not sent. Please try again in a few minutes, or call corporate support at 850 473-7453.', values: raw }
  }
}
