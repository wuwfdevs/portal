import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { derivedSecret } from '@/lib/audience/secret'
import { memberFeedAudioResponse } from '@/lib/members/feed-service'

export const dynamic = 'force-dynamic'

/** A members-only episode's audio, played from a member's private feed (phase 7d): token, membership and episode checked on every play. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; token: string; id: string }> }) {
  const { slug, token, id } = await params
  const payload = await getPayload({ config: configPromise })
  return memberFeedAudioResponse(payload, slug, token, id, derivedSecret('member-feed'), new Date())
}
