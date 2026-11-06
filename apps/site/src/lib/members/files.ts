import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { STORAGE_PREFIXES } from '@/plugins/storage'

/** The libraries whose members-only files a member may open, and where each keeps its files locally. */
export const MEMBER_FILE_COLLECTIONS = { audio: 'public/audio', 'archive-items': 'public/archive' } as const
export type MemberFileCollection = keyof typeof MEMBER_FILE_COLLECTIONS
export const isMemberFileCollection = (v: string): v is MemberFileCollection => Object.hasOwn(MEMBER_FILE_COLLECTIONS, v)

/** Where a member opens a members-only file: the route checks their membership on every request. */
export const memberFileHref = (collection: MemberFileCollection, id: string | number): string => `/account/files/${collection}/${id}`

/** How long a signed storage address works. Long enough to start playing; a player that reconnects later asks the route again. */
export const SIGNED_URL_SECONDS = 600

let client: S3Client | null = null

/**
 * A short-lived signed address for a file in the private bucket, or null when files are on local disk (development). The bucket
 * stays private; only this address, made after the membership check, opens it.
 */
export async function signedFileUrl(collection: MemberFileCollection, doc: { filename?: string | null; prefix?: string | null }): Promise<string | null> {
  const bucket = process.env.S3_BUCKET
  if (!bucket) return null
  client ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '', secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '' },
  })
  if (!doc.filename) return null
  // The storage plugin keeps each file under the prefix recorded on its row (the collection's folder unless the row says otherwise).
  const prefix = (doc.prefix ?? STORAGE_PREFIXES[collection]).replace(/\/+$/, '')
  const key = prefix ? `${prefix}/${doc.filename}` : doc.filename
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: SIGNED_URL_SECONDS })
}
