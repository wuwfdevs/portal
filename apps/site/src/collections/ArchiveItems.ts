import type { Access, CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionAfterReadHook, CollectionConfig } from 'payload'

import path from 'path'
import { fileURLToPath } from 'url'

import { requirePermission, userCan } from '../access/permissions'
import { isOpenToEveryone, membersOnlyField, NOT_MEMBERS_ONLY, privateFileHeaders } from '../lib/members/access'
import { revalidatePath } from '../lib/revalidate'
import { ARCHIVE_KINDS } from '../lib/shows/archive-kinds'
import { showPagePaths } from '../lib/shows/subpaths'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)


const staff = (req: Parameters<Access>[0]['req']) => userCan(req.user as never, 'content.write')

/**
 * Anyone may browse the catalogue (title, description, where it came from); only a file marked members-only is held
 * back. Payload asks the same access when it serves the file itself (`isReadingStaticFile`), so the file route refuses a
 * members' file while the record stays listable.
 */
const readArchive: Access = ({ req, isReadingStaticFile }) => {
  if (staff(req)) return true
  return isReadingStaticFile ? NOT_MEMBERS_ONLY : { _status: { equals: 'published' } }
}

/**
 * A members' item read through access control (the public catalogue) comes back without any address for its file (fail closed,
 * like a story's body). A trusted server read (`overrideAccess`, e.g. the member file route, which checks the membership itself)
 * keeps it, or it could not deliver the file.
 */
const hideMembersFile: CollectionAfterReadHook = ({ doc, req, overrideAccess }) => {
  if (overrideAccess === true || staff(req) || isOpenToEveryone(doc)) return doc
  const { url: _url, filename: _f, thumbnailURL: _t, filesize: _s, ...rest } = doc as Record<string, unknown>
  return rest
}

const showOf = async (req: Parameters<CollectionAfterChangeHook>[0]['req'], id: unknown): Promise<string | null> => {
  const showId = id && typeof id === 'object' ? (id as { id: string | number }).id : (id as string | number | null)
  if (showId == null) return null
  const show = await req.payload.findByID({ collection: 'productions', id: showId, depth: 0, overrideAccess: true, req, select: { path: true } }).catch(() => null)
  return show?.path ?? null
}
const revalidateArchive: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (!req.context.disableRevalidate) for (const p of [await showOf(req, doc.production), await showOf(req, previousDoc?.production)]) if (p) for (const q of showPagePaths(p)) revalidatePath(q)
  return doc
}
const revalidateArchiveDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const p = req.context.disableRevalidate ? null : await showOf(req, doc?.production)
  if (p) for (const q of showPagePaths(p)) revalidatePath(q)
  return doc
}

/**
 * A themed show's Archive (board 21): the primary materials behind its episodes, each one file with its catalogue entry.
 * "Anyone can browse the catalog. Members open the full documents and audio."
 */
export const ArchiveItems: CollectionConfig = {
  slug: 'archive-items',
  labels: { singular: 'Archive item', plural: 'Archive items' },
  access: {
    create: requirePermission('content.write'),
    read: readArchive,
    update: requirePermission('content.write'),
    delete: requirePermission('content.publish'),
  },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'production', 'kind', 'membersOnly', 'updatedAt'],
    description: "A show's Archive: documents, maps, photographs and recordings behind its episodes. The catalogue is public; a members-only item's file is not.",
  },
  forceSelect: { membersOnly: true },
  versions: { drafts: true },
  hooks: { afterRead: [hideMembersFile], afterChange: [revalidateArchive], afterDelete: [revalidateArchiveDelete] },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'production', type: 'relationship', relationTo: 'productions', required: true, index: true, filterOptions: { kind: { equals: 'original' } }, admin: { position: 'sidebar' } },
    { name: 'kind', type: 'select', required: true, defaultValue: 'document', options: [...ARCHIVE_KINDS], admin: { position: 'sidebar' } },
    membersOnlyField('Only members may open the file. Its title, description and source stay public in the catalogue.'),
    { name: 'source', type: 'text', admin: { description: 'Where it came from and when, e.g. "U.S. Army Corps of Engineers, 1903" or "Recorded 1996".' } },
    { name: 'description', type: 'textarea', maxLength: 600 },
    { name: 'episode', type: 'relationship', relationTo: 'posts', admin: { description: 'The episode it is cited in, if any.' } },
    { name: 'sortDate', type: 'date', admin: { position: 'sidebar', description: 'Orders the catalogue, newest first. Defaults to when it was added.' } },
  ],
  upload: {
    staticDir: path.resolve(dirname, '../../public/archive'),
    mimeTypes: ['application/pdf', 'image/*', 'audio/*', 'text/plain'],
    modifyResponseHeaders: privateFileHeaders,
  },
}
