import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { MEMBER_FILE_COLLECTIONS, signedFileUrl, type MemberFileCollection } from './files'

export const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' } as const

/**
 * Hands a member a members-only file once every check has passed: a 10-minute signed address in the private bucket when hosted,
 * the bytes from disk in development. The file name comes from the database, never from the request.
 */
export async function deliverMemberFile(collection: MemberFileCollection, doc: { filename?: string | null; prefix?: string | null; mimeType?: string | null }): Promise<Response> {
  const signed = await signedFileUrl(collection, doc)
  if (signed) return new Response(null, { status: 302, headers: { ...PRIVATE_HEADERS, Location: signed } })
  if (!doc.filename) return new Response('Not found', { status: 404, headers: PRIVATE_HEADERS })
  const dir = path.resolve(process.cwd(), MEMBER_FILE_COLLECTIONS[collection])
  const file = path.resolve(dir, doc.filename)
  if (!file.startsWith(`${dir}${path.sep}`)) return new Response('Not found', { status: 404, headers: PRIVATE_HEADERS })
  const bytes = await readFile(file).catch(() => null)
  if (!bytes) return new Response('Not found', { status: 404, headers: PRIVATE_HEADERS })
  return new Response(new Uint8Array(bytes), { headers: { ...PRIVATE_HEADERS, 'Content-Type': doc.mimeType ?? 'application/octet-stream' } })
}
