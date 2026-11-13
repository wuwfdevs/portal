'use server'

import { LISTENING_PATHS } from '@wuwf/portal-contracts'

import { checkKitchen, kitchenTablePath } from '@/lib/listening/kitchen'
import { callListening } from '@/lib/listening/portal'
import { currentClientHash, currentVisitorSubject } from '@/lib/listening/request-context'
import { failure, isPublicId, type ActionResult } from '@/lib/listening/results'

/**
 * Starts a kitchen table for a campaign that accepts them. The Portal makes the event and its table and returns the table's single-use
 * link once; the page that opened it goes straight to that link, whose phone then reads the agreement aloud before anything records.
 * The link is never stored on this site and never logged. A person at a table is not a subject; the host who starts one is the visitor.
 */
export async function startKitchenTable(input: { campaignPublicId: string; hostName: string; place: string }): Promise<ActionResult<{ path: string }>> {
  if (!isPublicId(input.campaignPublicId) || typeof input.hostName !== 'string' || typeof input.place !== 'string') return failure('invalid_request')
  const checked = checkKitchen(input)
  if (!checked.ok) return { ...failure('invalid_request'), message: checked.message }
  const subject = await currentVisitorSubject(true)
  if (!subject) return failure('unavailable')
  const hash = await currentClientHash()
  const result = await callListening<{ linkToken: string }>(LISTENING_PATHS.kitchenTableCreate, {
    subject,
    campaignPublicId: input.campaignPublicId,
    hostName: checked.value.hostName,
    place: checked.value.place,
    ...(hash ? { clientHash: hash } : {}),
  })
  return result.ok ? { ok: true, path: kitchenTablePath(result.linkToken) } : failure(result.error)
}
