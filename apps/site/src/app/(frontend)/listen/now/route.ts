import { NextResponse, type NextRequest } from 'next/server'

import { fetchNowNext } from '@/lib/live/cadence'
import { liveChannels } from '@/lib/live/channels'
import { getCachedGlobal } from '@/utilities/getGlobals'

/**
 * "On now" and "Up next" for one configured channel (board 26), for the player bar and the Listen live page:
 * `/listen/now?channel=<Cadence channel ID>`. Only a channel set in the Listen live settings is answered, so this is
 * never a general way to read Cadence. The answer is cached briefly at the edge; the times let the browser drop a
 * program the moment it ends.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('channel') ?? ''
  const settings = await getCachedGlobal('listen-live', 0)()
  const channel = liveChannels(settings?.channels).find((c) => c.cadenceChannelId === id)
  if (!channel?.cadenceChannelId) {
    return NextResponse.json({ error: 'Unknown channel' }, { status: 404, headers: { 'cache-control': 'no-store' } })
  }
  const { data, fresh } = await fetchNowNext(channel.cadenceChannelId)
  return NextResponse.json(
    { ...data, fresh },
    { headers: { 'cache-control': fresh ? 'public, max-age=30, s-maxage=60, stale-while-revalidate=60' : 'public, max-age=15' } },
  )
}
