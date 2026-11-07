import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { siteOrigin } from '@/lib/audience/origin'
import { derivedSecret } from '@/lib/audience/secret'
import { PRIVATE_HEADERS } from '@/lib/members/deliver'
import { memberFeedResponse } from '@/lib/members/feed-service'

export const dynamic = 'force-dynamic'

/** A member's private podcast feed, `/feeds/<show>/<token>.xml` (phase 7d; `lib/members/feed-service.ts`). */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params
  if (!token.endsWith('.xml')) return new Response('Not found', { status: 404, headers: PRIVATE_HEADERS })
  const payload = await getPayload({ config: configPromise })
  return memberFeedResponse(payload, slug, token.slice(0, -4), siteOrigin(), derivedSecret('member-feed'), new Date())
}
