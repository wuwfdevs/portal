// @vitest-environment node
import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload, type PayloadRequest } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { placementDeliveryEndpoints } from '@/collections/placementDeliveryEndpoints'
import { readCounts } from '@/lib/analytics/counts'
import { FILTER_VERSION } from '@/lib/analytics/filter'
import { stationDay } from '@/lib/placements/pick'

// The placement counter end to end on a real database: a browser's post through the route adds to the day's totals (and only what passes the
// filter and matches a running placement), a second post adds to the same row, and the delivery endpoint reads it back for staff with the
// sponsorship role only. The running placements are a stand-in (the real lookup goes through Next's cache, which does not run here).

const PLACEMENT = 900_000 + Math.floor(Math.random() * 90_000)
const SPONSOR = 800_000 + Math.floor(Math.random() * 90_000)
const OTHER = PLACEMENT + 1

vi.mock('@/lib/placements/load', () => ({
  knownPlacements: async () =>
    new Map([
      [String(PLACEMENT), { id: String(PLACEMENT), zone: 'home.rail', kind: 'sponsor', sponsorId: String(SPONSOR) }],
      [String(OTHER), { id: String(OTHER), zone: 'list.rail', kind: 'sponsor', sponsorId: String(SPONSOR) }],
    ]),
}))

const { POST } = await import('@/app/api/placement-counts/route')

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const ORIGIN = 'https://site.test'
const ev = (name: string, placement = PLACEMENT, zone = 'home.rail') => ({ name, placement_id: String(placement), sponsor_id: String(SPONSOR), zone, kind: 'sponsor' })
const beacon = (events: unknown[], headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/placement-counts`, {
    method: 'POST',
    body: JSON.stringify({ events }),
    headers: { 'content-type': 'text/plain;charset=UTF-8', 'user-agent': CHROME, origin: ORIGIN, 'sec-fetch-site': 'same-origin', ...headers },
  })

let payload: Payload
const today = () => stationDay(new Date())

beforeAll(async () => {
  payload = await getPayload({ config: await config })
})

afterAll(async () => {
  await (payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } }).drizzle.execute(sql`DELETE FROM placement_counts WHERE sponsor_id = ${SPONSOR}`)
})

describe('the placement counter', () => {
  it('adds a browser\'s events to the day\'s totals, and a second post to the same row', async () => {
    expect((await POST(beacon([ev('sponsor_placement_measurable'), ev('sponsor_placement_viewable')]))).status).toBe(204)
    expect((await POST(beacon([ev('sponsor_placement_measurable'), ev('sponsor_placement_clicked'), ev('sponsor_placement_measurable', OTHER, 'list.rail')]))).status).toBe(204)
    const rows = await readCounts(payload, { sponsorId: SPONSOR }, today(), today())
    expect(rows).toEqual([
      { day: today(), placementId: PLACEMENT, zone: 'home.rail', kind: 'sponsor', sponsorId: SPONSOR, filterVersion: FILTER_VERSION, measurable: 2, viewable: 1, clicked: 1 },
      { day: today(), placementId: OTHER, zone: 'list.rail', kind: 'sponsor', sponsorId: SPONSOR, filterVersion: FILTER_VERSION, measurable: 1, viewable: 0, clicked: 0 },
    ])
  })

  it('answers 204 and counts nothing from a bot, another site, an unknown placement or a malformed post', async () => {
    const before = await readCounts(payload, { placementId: PLACEMENT }, today(), today())
    for (const request of [
      beacon([ev('sponsor_placement_measurable')], { 'user-agent': 'curl/8.5.0' }),
      beacon([ev('sponsor_placement_measurable')], { origin: 'https://elsewhere.test', 'sec-fetch-site': 'cross-site' }),
      beacon([ev('sponsor_placement_measurable', PLACEMENT + 2)]),
      beacon([ev('sponsor_placement_measurable', PLACEMENT, 'home.top')]),
      new Request(`${ORIGIN}/api/placement-counts`, { method: 'POST', body: '{not json', headers: { 'user-agent': CHROME, origin: ORIGIN } }),
    ]) {
      const response = await POST(request)
      expect(response.status).toBe(204)
      expect(await response.text()).toBe('')
    }
    expect(await readCounts(payload, { placementId: PLACEMENT }, today(), today())).toEqual(before)
  })
})

describe('the delivery endpoint', () => {
  const handler = placementDeliveryEndpoints[0]!.handler
  const call = (query: string, roles: string[] | null) =>
    handler({ payload, user: roles ? { id: 1, roles } : null, url: `http://localhost/api/placement-items/delivery?${query}` } as unknown as PayloadRequest) as Promise<Response>

  it('is for staff with the sponsorship role only', async () => {
    expect((await call(`sponsor=${SPONSOR}`, null)).status).toBe(401)
    expect((await call(`sponsor=${SPONSOR}`, ['editor', 'publisher'])).status).toBe(403)
    expect((await call(`sponsor=${SPONSOR}`, ['sponsorship'])).status).toBe(200)
  })

  it('reads a sponsor\'s totals back, and refuses a bad question', async () => {
    const report = (await (await call(`sponsor=${SPONSOR}&from=${today()}&to=${today()}`, ['sponsorship'])).json()) as { total: unknown; placements: unknown[] }
    expect(report.total).toEqual({ measurable: 3, viewable: 1, clicked: 1 })
    expect(report.placements).toHaveLength(2)
    expect((await call(`sponsor=${SPONSOR}&placement=${PLACEMENT}`, ['sponsorship'])).status).toBe(400)
    expect((await call('sponsor=abc', ['sponsorship'])).status).toBe(400)
    expect((await call(`sponsor=${SPONSOR}&from=2026-11-05&to=2026-11-01`, ['sponsorship'])).status).toBe(400)
  })

  it('gives the sponsor\'s export as a CSV file', async () => {
    const response = await call(`placement=${PLACEMENT}&from=${today()}&to=${today()}&format=csv`, ['sponsorship'])
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename=".+\.csv"$/)
    const csv = await response.text()
    expect(csv).toContain('not audited')
    expect(csv).toContain('fewer than 10') // two shown, one viewed, one clicked: all small
  })
})
