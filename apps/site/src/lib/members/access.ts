import type { Access, CheckboxField, FieldAccess, Where } from 'payload'

import { userCan } from '../../access/permissions'

/**
 * Members-only work (ROADMAP → Phase 7). A story or an audio file marked members-only keeps its title, teaser and picture
 * public, so it can be listed with a "Members" label, but its body and its audio are never read out to the public.
 *
 * Until audience sign-in and entitlements exist (phase 7b, 7c), nobody outside the staff can read them at all: these rules
 * are the one place that later grows a "or the reader holds a membership" branch.
 *
 * Fail closed: a body or audio field is readable only when the document says, explicitly, that it is NOT members-only.
 * `forceSelect` on each collection makes sure the flag is always read, even by a query that selects a few fields.
 */
export const membersOnlyField = (description: string): CheckboxField => ({
  name: 'membersOnly',
  type: 'checkbox',
  label: 'Members only',
  defaultValue: false,
  index: true,
  admin: { position: 'sidebar', description },
})

type Flagged = { membersOnly?: boolean | null } | null | undefined

/** Whether staff are reading (anyone who can write content sees members' work, for review and preview). */
const staffReads = (req: Parameters<FieldAccess>[0]['req']): boolean => userCan(req.user as never, 'content.write')

/** True only for a document that is known not to be members-only. A missing flag is not "free". */
export const isOpenToEveryone = (doc: Flagged): boolean => doc?.membersOnly === false

/** Field access for a body or audio field: staff, or a document known to be open to everyone. */
export const readableUnlessMembersOnly: FieldAccess = ({ req, doc }) => staffReads(req) || isOpenToEveryone(doc as Flagged)

/** The public may read only rows that are not members-only. */
export const NOT_MEMBERS_ONLY: Where = { membersOnly: { equals: false } }

/** Collection read access for a library whose members-only files must not be fetched (the file route applies it too). */
export const publicUnlessMembersOnly: Access = ({ req }) => (staffReads(req) ? true : NOT_MEMBERS_ONLY)

/**
 * A members-only story's audio must itself be members-only, or anyone could play it from the file's address.
 * Returns the message to show, or null when the pairing is safe.
 */
export function membersAudioProblem(story: Flagged, audio: Flagged): string | null {
  if (story?.membersOnly !== true || !audio) return null
  return audio.membersOnly === true
    ? null
    : 'This story is for members only, but its featured audio is a public file anyone can play from its address. Mark the audio file "Members only" in the audio library, or pick a members-only file.'
}

/**
 * Response headers for a file that may be members-only: never kept by a shared cache (a CDN would hand it to anyone).
 * The listener's own browser may still cache it. The hook cannot see which file it serves, so it applies to the whole
 * library; public files were not shared-cached before either (Payload's file route sets no Cache-Control).
 */
export function privateFileHeaders({ headers }: { headers: Headers }): Headers {
  headers.set('Cache-Control', 'private')
  return headers
}
