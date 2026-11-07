import type { Payload } from 'payload'

import type { Audio, Post } from '@/payload-types'

import type { AudienceUser } from '../audience/auth'
import { hasMembersListening } from './claim'
import { memberFileHref } from './files'

export type MemberPiece = { kind: 'redirect'; to: string } | { kind: 'not-found' } | { kind: 'show'; post: Post }

/**
 * What the private member view (/account/listen/<id>) shows a reader (phase 7c-2): a signed-out reader goes to sign in and back, a
 * free piece to its own address, a reader without members' listening to their account; a member gets the whole piece, its audio
 * pointed at the members' file route (which checks again).
 */
export async function memberPiece(payload: Payload, user: AudienceUser | null, rawId: string, now: Date): Promise<MemberPiece> {
  if (!/^\d{1,12}$/.test(rawId)) return { kind: 'not-found' }
  const here = `/account/listen/${rawId}`
  if (!user) return { kind: 'redirect', to: `/account/sign-in?next=${encodeURIComponent(here)}` }
  const post = (await payload.findByID({ collection: 'posts', id: rawId, depth: 2, draft: false, overrideAccess: true, disableErrors: true })) as Post | null
  if (!post || post._status !== 'published' || !post.path) return { kind: 'not-found' }
  if (post.membersOnly !== true) return { kind: 'redirect', to: post.path }
  if (!(await hasMembersListening(payload, user.id, now))) return { kind: 'redirect', to: '/account' }
  const audio = post.featuredAudio && typeof post.featuredAudio === 'object' ? (post.featuredAudio as Audio) : null
  return { kind: 'show', post: audio ? { ...post, featuredAudio: { ...audio, url: memberFileHref('audio', audio.id) } } : post }
}
