import configPromise from '@payload-config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'
import { getPayload } from 'payload'

import { supabaseAudienceAuth } from '@/lib/audience/supabase'
import { hasMembersListening } from '@/lib/members/claim'
import { isMemberFileCollection, MEMBER_FILE_COLLECTIONS, signedFileUrl } from '@/lib/members/files'

const PRIVATE = { 'Cache-Control': 'private, no-store' }

/**
 * A members-only audio or archive file, for a reader with members' listening (phase 7c-2). The membership is checked on every
 * request; then a hosted file is a 10-minute signed address in the private bucket, and a local one (development) is sent directly.
 * Signed out: to sign-in and back. Not a member: to the account page, which says why. A free file: its ordinary address.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ collection: string; id: string }> }) {
  const { collection, id } = await params
  if (!isMemberFileCollection(collection) || !/^\d{1,12}$/.test(id)) return new NextResponse('Not found', { status: 404, headers: PRIVATE })
  const here = request.nextUrl.pathname

  const user = await supabaseAudienceAuth.currentUser()
  if (!user) return NextResponse.redirect(new URL(`/account/sign-in?next=${encodeURIComponent(here)}`, request.nextUrl.origin), { headers: PRIVATE })

  const payload = await getPayload({ config: configPromise })
  const doc = (await payload.findByID({ collection, id, depth: 0, overrideAccess: true, disableErrors: true })) as
    | { membersOnly?: boolean | null; filename?: string | null; prefix?: string | null; mimeType?: string | null; url?: string | null; _status?: string | null }
    | null
  if (!doc?.filename || (collection === 'archive-items' && doc._status !== 'published')) return new NextResponse('Not found', { status: 404, headers: PRIVATE })
  if (doc.membersOnly !== true) return NextResponse.redirect(new URL(doc.url ?? '/', request.nextUrl.origin), { headers: PRIVATE })

  if (!(await hasMembersListening(payload, user.id, new Date()))) return NextResponse.redirect(new URL('/account', request.nextUrl.origin), { headers: PRIVATE })

  const signed = await signedFileUrl(collection, doc)
  if (signed) return NextResponse.redirect(signed, { headers: PRIVATE })

  // Local development: the file is on disk under the library's folder. The name comes from the database, never the request.
  const dir = path.resolve(process.cwd(), MEMBER_FILE_COLLECTIONS[collection])
  const file = path.resolve(dir, doc.filename)
  if (!file.startsWith(`${dir}${path.sep}`)) return new NextResponse('Not found', { status: 404, headers: PRIVATE })
  const bytes = await readFile(file).catch(() => null)
  if (!bytes) return new NextResponse('Not found', { status: 404, headers: PRIVATE })
  return new NextResponse(new Uint8Array(bytes), { headers: { ...PRIVATE, 'Content-Type': doc.mimeType ?? 'application/octet-stream' } })
}
