import { ValidationError, type CollectionBeforeChangeHook } from 'payload'

import { membersAudioProblem } from '../lib/members/access'

const idOf = (v: unknown): string | number | null =>
  v && typeof v === 'object' && 'id' in v ? (v as { id: string | number }).id : typeof v === 'string' || typeof v === 'number' ? v : null

/**
 * A members-only story may only carry members-only featured audio: a public file would be playable by anyone from its
 * address, whatever the story says. Checked on every save, drafts included, against the file as stored.
 */
export const membersAudioGuard: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const membersOnly = data.membersOnly ?? originalDoc?.membersOnly
  const audioId = idOf(data.featuredAudio !== undefined ? data.featuredAudio : originalDoc?.featuredAudio)
  if (membersOnly !== true || audioId === null) return data
  const audio = await req.payload
    .findByID({ collection: 'audio', id: audioId, depth: 0, overrideAccess: true, req, select: { membersOnly: true } })
    .catch(() => null)
  const problem = membersAudioProblem({ membersOnly: true }, audio ?? { membersOnly: false })
  if (problem) throw new ValidationError({ collection: 'posts', errors: [{ message: problem, path: 'featuredAudio' }] }, req.t)
  return data
}
