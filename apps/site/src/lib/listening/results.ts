import type { ListeningErrorCode } from '@wuwf/portal-contracts'

import { LISTENING_NOT_SET_UP, listeningMessage } from './messages'

/** What a server action hands back to a browser component: a value, or a sentence and the code behind it. */
export type ActionFailure = { ok: false; code: ListeningErrorCode | 'not_set_up'; message: string }
export type ActionResult<T> = ({ ok: true } & T) | ActionFailure

export function failure(code: ListeningErrorCode | 'not_set_up'): ActionFailure {
  return { ok: false, code, message: code === 'not_set_up' ? LISTENING_NOT_SET_UP : listeningMessage(code) }
}

/** The ids and text a browser sends are checked for shape before they are signed and forwarded; the Portal checks again. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PUBLIC_ID = /^[a-z0-9]{16}$/

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)
export const isPublicId = (value: unknown): value is string => typeof value === 'string' && PUBLIC_ID.test(value)

/**
 * A server action receives whatever a browser chooses to send, whatever its TypeScript says. So nothing a client sends is ever
 * spread into a signed body: each field is picked by name and checked, and the subject and the client hash are set by the
 * server last. These pick the two objects that arrive whole.
 */
const DETAIL_LIMITS = { name: 200, email: 320, phone: 40, city: 200, note: 4000 } as const

export interface PickedDetails {
  name: string | null
  email: string | null
  phone: string | null
  city: string | null
  note: string | null
}

/** The participant details, with each field a string within its limit or null; null overall if the shape is wrong. */
export function pickDetails(value: unknown): PickedDetails | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const out: Partial<PickedDetails> = {}
  for (const key of Object.keys(DETAIL_LIMITS) as (keyof PickedDetails)[]) {
    const field = record[key]
    if (field === null || field === undefined) {
      out[key] = null
    } else if (typeof field === 'string' && field.length <= DETAIL_LIMITS[key]) {
      out[key] = field
    } else {
      return null
    }
  }
  return out as PickedDetails
}

export interface PickedConsent {
  contact: boolean
  identify: boolean
  requestAnonymous: boolean
}

export function pickConsent(value: unknown): PickedConsent | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const { contact, identify, requestAnonymous } = record
  if (typeof contact !== 'boolean' || typeof identify !== 'boolean' || typeof requestAnonymous !== 'boolean') return null
  return { contact, identify, requestAnonymous }
}
