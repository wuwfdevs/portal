'use server'

import { LISTENING_PATHS } from '@wuwf/portal-contracts'

import { checkSeat } from '@/lib/listening/event'
import { callListening } from '@/lib/listening/portal'
import { currentClientHash, currentVisitorSubject } from '@/lib/listening/request-context'
import { failure, isPublicId, type ActionResult } from '@/lib/listening/results'

/**
 * Saves a seat at a public listening session: a name and an email used for that event only. This is the only place a seat is
 * made, so the name and email are collected as a side effect of the seat and not for anything else. Saving the same email again
 * changes nothing, and the Portal refuses a seat past the event's limit.
 */
export async function saveSeat(input: { publicId: string; name: string; email: string }): Promise<ActionResult<Record<never, never>>> {
  if (!isPublicId(input.publicId) || typeof input.name !== 'string' || typeof input.email !== 'string') return failure('invalid_request')
  const checked = checkSeat(input)
  if (!checked.ok) return { ...failure('invalid_request'), message: checked.message }
  const subject = await currentVisitorSubject(true)
  if (!subject) return failure('unavailable')
  const hash = await currentClientHash()
  const result = await callListening<Record<never, never>>(LISTENING_PATHS.seatSave, {
    publicId: input.publicId,
    subject,
    name: checked.value.name,
    email: checked.value.email,
    ...(hash ? { clientHash: hash } : {}),
  })
  return result.ok ? { ok: true } : failure(result.error)
}
