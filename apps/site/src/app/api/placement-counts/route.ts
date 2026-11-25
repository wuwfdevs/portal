import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { addCounts } from '@/lib/analytics/counts'
import { acceptedEvents, FILTER_VERSION, MAX_BODY_BYTES } from '@/lib/analytics/filter'
import { tally } from '@/lib/analytics/tally'
import { knownPlacements } from '@/lib/placements/load'
import { stationDay } from '@/lib/placements/pick'

// The placement counter (`ANALYTICS.md`, "The placement counter"). The page's script posts the placement events it saw (`lib/analytics/beacon.ts`);
// this adds the ones that pass the filter (`lib/analytics/filter.ts`) to the day's totals. Nothing about the visitor is read or kept: not the
// address, not a cookie, not the page. It always answers 204 with no body, whatever it counted, so a client learns nothing about the filter, and a
// failure here never reaches a reader.
export const maxDuration = 10

const DONE = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request): Promise<Response> {
  try {
    const declared = Number(request.headers.get('content-length') ?? '0')
    if (declared > MAX_BODY_BYTES) return DONE()
    const body = await request.text()
    const events = acceptedEvents({
      userAgent: request.headers.get('user-agent'),
      origin: request.headers.get('origin'),
      secFetchSite: request.headers.get('sec-fetch-site'),
      siteOrigin: new URL(request.url).origin,
      body,
    })
    if (events.length === 0) return DONE()
    const rows = tally(events, await knownPlacements(), stationDay(new Date()), FILTER_VERSION)
    if (rows.length === 0) return DONE()
    const payload = await getPayload({ config: configPromise })
    await addCounts(payload, rows)
  } catch (err) {
    try {
      const payload = await getPayload({ config: configPromise })
      payload.logger.error({ err, msg: 'Placement counts could not be saved' })
    } catch {
      // Nothing more can be done; the page is unaffected.
    }
  }
  return DONE()
}
