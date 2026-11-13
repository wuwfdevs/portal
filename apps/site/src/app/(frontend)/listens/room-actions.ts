'use server'

import { LISTENING_PATHS, LISTENING_ROOM_ACTIONS, type ListeningRoom, type ListeningRoomAction } from '@wuwf/portal-contracts'

import { supabaseAudienceAuth } from '@/lib/audience/supabase'
import { callListening } from '@/lib/listening/portal'
import { currentClientHash } from '@/lib/listening/request-context'
import { failure, isPublicId, type ActionResult } from '@/lib/listening/results'

/**
 * The organizer's console (board 5g). The organizer is a site account: the subject sent is that account's id, and the Portal
 * answers only if that subject owns the event. The Portal never learns who the account is. Each read is also the console checking
 * in, which is what allows a table's phone to say "Help is coming".
 */
async function accountSubject() {
  const user = await supabaseAudienceAuth.currentUser()
  return user ? ({ kind: 'account', id: user.id } as const) : null
}

export async function readRoom(eventPublicId: string): Promise<ActionResult<{ room: ListeningRoom }>> {
  if (!isPublicId(eventPublicId)) return failure('invalid_request')
  const subject = await accountSubject()
  if (!subject) return failure('not_found')
  const hash = await currentClientHash()
  const result = await callListening<{ room: ListeningRoom }>(LISTENING_PATHS.room, { subject, eventPublicId, ...(hash ? { clientHash: hash } : {}) })
  return result.ok ? { ok: true, room: result.room } : failure(result.error)
}

/** Last five minutes, the room's prompt, or clearing a table's request for a hand. */
export async function callRoom(input: { eventPublicId: string; action: ListeningRoomAction; value?: number }): Promise<ActionResult<{ room: ListeningRoom }>> {
  if (!isPublicId(input.eventPublicId) || !(LISTENING_ROOM_ACTIONS as readonly string[]).includes(input.action)) return failure('invalid_request')
  if (input.action !== 'last-call' && (!Number.isInteger(input.value) || (input.value as number) < 0)) return failure('invalid_request')
  const subject = await accountSubject()
  if (!subject) return failure('not_found')
  const hash = await currentClientHash()
  const result = await callListening<{ room: ListeningRoom }>(LISTENING_PATHS.roomCall, {
    subject,
    eventPublicId: input.eventPublicId,
    action: input.action,
    ...(input.action === 'last-call' ? {} : { value: input.value }),
    ...(hash ? { clientHash: hash } : {}),
  })
  return result.ok ? { ok: true, room: result.room } : failure(result.error)
}
