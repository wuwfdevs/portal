import type { Endpoint, PayloadRequest } from 'payload'

import { userCan } from '@/access/permissions'
import { readCounts } from '@/lib/analytics/counts'
import { buildReport, reportRange, sponsorCsv } from '@/lib/analytics/report'
import { stationDay } from '@/lib/placements/pick'

/**
 * `GET /api/placement-items/delivery`: what the site counted for one placement (`?placement=<id>`) or every placement of one sponsor
 * (`?sponsor=<id>`), between `from` and `to` (station days; the last 30 days when left out). JSON for the admin panels
 * (`components/admin/PlacementDelivery`); `&format=csv` is the sponsor's export (`sponsorCsv`: small figures hidden, definitions printed).
 * Staff with `sponsorship.manage` only: counts are commercial, not editorial.
 */

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
const ID = /^\d{1,10}$/

function refusal(req: PayloadRequest): Response | null {
  if (!req.user) return json({ error: 'Sign in to the admin first.' }, 401)
  if (!userCan(req.user as { roles?: readonly string[] | null }, 'sponsorship.manage')) return json({ error: 'You need the sponsorship role to see delivery.' }, 403)
  return null
}

const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'delivery'

export const placementDeliveryEndpoints: Omit<Endpoint, 'root'>[] = [
  {
    path: '/delivery',
    method: 'get',
    handler: async (req) => {
      const denied = refusal(req)
      if (denied) return denied
      const params = new URL(req.url ?? 'http://x').searchParams
      const placement = params.get('placement')
      const sponsor = params.get('sponsor')
      if ((placement === null) === (sponsor === null)) return json({ error: 'Ask for one placement or one sponsor.' }, 400)
      const id = (placement ?? sponsor)!
      if (!ID.test(id)) return json({ error: 'That is not a record id.' }, 400)
      const range = reportRange(params.get('from'), params.get('to'), stationDay(new Date()))
      if ('error' in range) return json({ error: range.error }, 400)

      const counts = await readCounts(req.payload, placement !== null ? { placementId: Number(id) } : { sponsorId: Number(id) }, range.from, range.to)
      const ids = [...new Set(counts.map((c) => c.placementId))]
      const found = ids.length
        ? await req.payload.find({ collection: 'placement-items', where: { id: { in: ids } }, depth: 0, limit: ids.length, pagination: false, overrideAccess: true, select: { name: true } })
        : { docs: [] }
      const names = new Map(found.docs.map((d) => [Number(d.id), d.name] as const))
      const report = buildReport(counts, names, range.from, range.to)

      if (params.get('format') !== 'csv') return json(report)

      let title: string
      if (sponsor !== null) {
        const s = await req.payload.find({ collection: 'sponsors', where: { id: { equals: Number(id) } }, depth: 0, limit: 1, overrideAccess: true, select: { name: true } })
        title = `WUWF.org sponsor messages: ${s.docs[0]?.name ?? `sponsor ${id}`}`
      } else {
        const p = await req.payload.find({ collection: 'placement-items', where: { id: { equals: Number(id) } }, depth: 0, limit: 1, overrideAccess: true, select: { name: true } })
        title = `WUWF.org sponsor message: ${p.docs[0]?.name ?? `placement ${id}`}`
      }
      return new Response(sponsorCsv(report, title), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${fileSafe(title.replace(/^WUWF\.org sponsor messages?: /, ''))}-${range.from}-to-${range.to}.csv"`,
          'cache-control': 'no-store',
        },
      })
    },
  },
]
