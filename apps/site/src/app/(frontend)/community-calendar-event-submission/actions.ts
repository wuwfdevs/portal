'use server'

import configPromise from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

import { clientAddress, TOKEN_FIELD, HONEYPOT_FIELD } from '@/lib/events/abuse'
import { formTokenFor, submissionSecrets } from '@/lib/events/secrets'
import { processSubmission } from '@/lib/events/submit'

export interface FormState {
  status: 'idle' | 'ok' | 'error'
  message?: string
  errors?: Record<string, string>
  /** What the visitor typed, so a refused form comes back filled in. Text only; a chosen file cannot be kept. */
  values?: Record<string, string | string[]>
  /** A fresh timing token when the old one can no longer be used. */
  token?: string
}

const MAX_FIELDS = 120
const MAX_VALUE = 10_000

export async function submitEvent(_previous: FormState, formData: FormData): Promise<FormState> {
  const raw: Record<string, string | string[]> = {}
  let count = 0
  for (const name of new Set(formData.keys())) {
    if (name.startsWith('$') || name === TOKEN_FIELD || name === HONEYPOT_FIELD || name === 'event-image') continue
    if (++count > MAX_FIELDS) break
    const all = formData.getAll(name).filter((v): v is string => typeof v === 'string').map((v) => v.slice(0, MAX_VALUE))
    raw[name] = name === 'event-category' ? all : (all[0] ?? '')
  }

  const file = formData.get('event-image')
  const image = file instanceof File && file.size > 0 ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : null
  const token = formData.get(TOKEN_FIELD)
  const honeypot = formData.get(HONEYPOT_FIELD)
  const h = await headers()

  const payload = await getPayload({ config: configPromise })
  const outcome = await processSubmission(
    payload,
    {
      raw,
      token: typeof token === 'string' ? token : undefined,
      honeypot: typeof honeypot === 'string' ? honeypot : undefined,
      image,
      address: clientAddress(h.get('x-forwarded-for')),
      now: new Date(),
    },
    submissionSecrets(),
  ).catch((error: unknown) => {
    // Never log what was submitted; the error's own message is about our systems, not their words.
    payload.logger.error(`Community calendar submission failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    return null
  })

  switch (outcome?.kind) {
    case 'ok':
      return { status: 'ok' }
    case 'invalid':
      return { status: 'error', message: 'Some answers need another look. They are marked below.', errors: outcome.errors, values: raw }
    case 'form-expired':
      return { status: 'error', message: 'This form was open for a long time, so it needs to be sent again. Your answers are kept. Press Send once more.', values: raw, token: formTokenFor() }
    case 'too-fast':
      return { status: 'error', message: 'That was very quick. Please check your answers, then press Send again.', values: raw }
    case 'limited':
      return {
        status: 'error',
        message: `You have sent several events recently. Please try again ${outcome.retryAfter === 'hour' ? 'in an hour' : 'tomorrow'}, or contact WUWF if something is urgent.`,
        values: raw,
      }
    default:
      return { status: 'error', message: 'Something went wrong on our side and your event was not sent. Please try again in a few minutes.', values: raw }
  }
}
