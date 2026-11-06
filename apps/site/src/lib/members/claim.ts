import type { Payload } from 'payload'

import type { AudienceUser } from '../audience/auth'
import { hashClaimToken, inGrace, isActive, looksLikeClaimToken } from './entitlement'

type Row = { id: string | number; name: string; endsOn: string; account?: unknown; claim?: { expiresAt?: string | null; claimedAt?: string | null } | null }

export type ClaimCheck = { kind: 'ok'; membership: Row } | { kind: 'invalid' } | { kind: 'expired' }

/** Finds the membership a claim link belongs to. A used link has no hash left, so it reads as invalid. */
export async function checkClaim(payload: Payload, token: unknown, now: Date): Promise<ClaimCheck> {
  if (!looksLikeClaimToken(token)) return { kind: 'invalid' }
  const found = await payload.find({ collection: 'memberships', where: { 'claim.tokenHash': { equals: hashClaimToken(token) } }, limit: 1, depth: 0, overrideAccess: true, pagination: false })
  const row = found.docs[0] as unknown as Row | undefined
  if (!row) return { kind: 'invalid' }
  const until = row.claim?.expiresAt ? Date.parse(row.claim.expiresAt) : 0
  if (!until || now.getTime() > until) return { kind: 'expired' }
  return { kind: 'ok', membership: row }
}

/** The reader's profile, made if their first sign-in did not get to make one. */
async function profileOf(payload: Payload, user: AudienceUser, now: Date): Promise<string | number> {
  const found = await payload.find({ collection: 'audience-profiles', where: { supabaseUserId: { equals: user.id } }, limit: 1, depth: 0, overrideAccess: true, pagination: false })
  if (found.docs[0]) return found.docs[0].id
  const at = now.toISOString()
  return (await payload.create({ collection: 'audience-profiles', data: { supabaseUserId: user.id, firstSignInAt: at, lastSignInAt: at }, overrideAccess: true, context: { disableRevalidate: true } })).id
}

/**
 * Connects the membership a claim link belongs to with the signed-in reader's account, and spends the link. The account the link
 * was opened in is the one connected, whatever address it signed in with: holding the link is the proof (it went only to the
 * address on the membership).
 */
export async function claimMembership(payload: Payload, token: unknown, user: AudienceUser, now: Date): Promise<ClaimCheck> {
  const check = await checkClaim(payload, token, now)
  if (check.kind !== 'ok') return check
  const account = await profileOf(payload, user, now)
  await payload.update({
    collection: 'memberships',
    id: check.membership.id,
    data: { account, claim: { tokenHash: null, expiresAt: null, claimedAt: now.toISOString() } } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  return check
}

export type MembershipStatus = { state: 'none' } | { state: 'active'; endsOn: string; inGrace: boolean } | { state: 'ended'; endsOn: string }

/** What the reader's connected memberships give them now: the furthest-reaching one decides. */
export async function membershipStatus(payload: Payload, supabaseUserId: string, now: Date): Promise<MembershipStatus> {
  const profile = await payload.find({ collection: 'audience-profiles', where: { supabaseUserId: { equals: supabaseUserId } }, limit: 1, depth: 0, overrideAccess: true, pagination: false })
  const id = profile.docs[0]?.id
  if (id === undefined) return { state: 'none' }
  const rows = await payload.find({ collection: 'memberships', where: { account: { equals: id } }, sort: '-endsOn', limit: 1, depth: 0, overrideAccess: true, pagination: false })
  const best = rows.docs[0] as unknown as Row | undefined
  if (!best) return { state: 'none' }
  return isActive(best.endsOn, now) ? { state: 'active', endsOn: best.endsOn, inGrace: inGrace(best.endsOn, now) } : { state: 'ended', endsOn: best.endsOn }
}

/** Whether a signed-in reader has members' listening now. The one check every members-only read goes through (7c-2). */
export async function hasMembersListening(payload: Payload, supabaseUserId: string, now: Date): Promise<boolean> {
  return (await membershipStatus(payload, supabaseUserId, now)).state === 'active'
}
