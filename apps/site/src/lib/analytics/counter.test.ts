import { describe, expect, it, vi } from 'vitest'

import { BATCH_WAIT_MS, COUNTER_PATH, createBeaconSink, type BeaconDeps } from './beacon'
import type { PlacementEvent } from './events'
import { acceptedEvents, FILTER_VERSION, isHumanAgent, isSameOrigin, MAX_BODY_BYTES, MAX_EVENTS, type CollectInput } from './filter'
import { addDays, buildReport, dayOrNull, MIN_REPORTED, reportRange, sponsorCsv, sponsorFigure, type CountLike } from './report'
import { tally, type KnownPlacement } from './tally'

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
const SITE = 'https://wuwf.org'

const ev = (name: PlacementEvent['name'], over: Partial<PlacementEvent> = {}): PlacementEvent => ({ name, placement_id: '12', sponsor_id: '7', zone: 'home.rail', kind: 'sponsor', ...over })
const post = (events: unknown[], over: Partial<CollectInput> = {}): CollectInput => ({ userAgent: CHROME, origin: SITE, secFetchSite: 'same-origin', siteOrigin: SITE, body: JSON.stringify({ events }), ...over })

describe('the traffic filter', () => {
  it('takes browsers and leaves out automated clients', () => {
    expect(isHumanAgent(CHROME)).toBe(true)
    expect(isHumanAgent(IPHONE)).toBe(true)
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36 Chrome-Lighthouse',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'curl/8.5.0',
      'python-requests/2.32.3',
      '',
      null,
    ])
      expect(isHumanAgent(ua)).toBe(false)
  })
  it('takes only posts from the site\'s own pages', () => {
    expect(isSameOrigin({ origin: SITE, secFetchSite: 'same-origin' }, SITE)).toBe(true)
    expect(isSameOrigin({ origin: SITE, secFetchSite: null }, SITE)).toBe(true) // an older browser without Sec-Fetch
    expect(isSameOrigin({ origin: null, secFetchSite: 'same-origin' }, SITE)).toBe(true)
    expect(isSameOrigin({ origin: 'https://evil.example', secFetchSite: 'cross-site' }, SITE)).toBe(false)
    expect(isSameOrigin({ origin: SITE, secFetchSite: 'cross-site' }, SITE)).toBe(false)
    expect(isSameOrigin({ origin: null, secFetchSite: null }, SITE)).toBe(false)
  })
  it('accepts well-formed events and counts each kind once per placement in a post', () => {
    const got = acceptedEvents(post([ev('sponsor_placement_measurable'), ev('sponsor_placement_measurable'), ev('sponsor_placement_viewable'), ev('sponsor_placement_measurable', { placement_id: '13' })]))
    expect(got.map((e) => `${e.name}:${e.placement_id}`)).toEqual(['sponsor_placement_measurable:12', 'sponsor_placement_viewable:12', 'sponsor_placement_measurable:13'])
  })
  it('drops what is malformed and keeps the rest', () => {
    expect(acceptedEvents(post([ev('sponsor_placement_clicked'), { ...ev('sponsor_placement_clicked', { placement_id: '9' }), page: '/news/x' }, 'junk'])).map((e) => e.placement_id)).toEqual(['12'])
  })
  it('refuses a whole post that is not JSON, too long, too big, empty, from a bot or from elsewhere', () => {
    expect(acceptedEvents(post([], { body: 'not json' }))).toEqual([])
    expect(acceptedEvents(post([]))).toEqual([])
    expect(acceptedEvents(post(Array.from({ length: MAX_EVENTS + 1 }, (_, i) => ev('sponsor_placement_measurable', { placement_id: String(i + 1) }))))).toEqual([])
    expect(acceptedEvents(post([ev('sponsor_placement_measurable')], { body: JSON.stringify({ events: [ev('sponsor_placement_measurable')], pad: 'x'.repeat(MAX_BODY_BYTES) }) }))).toEqual([])
    expect(acceptedEvents(post([ev('sponsor_placement_measurable')], { userAgent: 'curl/8.5.0' }))).toEqual([])
    expect(acceptedEvents(post([ev('sponsor_placement_measurable')], { origin: 'https://evil.example', secFetchSite: 'cross-site' }))).toEqual([])
    expect(acceptedEvents(post([], { body: JSON.stringify([ev('sponsor_placement_measurable')]) }))).toEqual([])
  })
})

describe('the tally', () => {
  const known = new Map<string, KnownPlacement>([
    ['12', { id: '12', zone: 'home.rail', kind: 'sponsor', sponsorId: '7' }],
    ['20', { id: '20', zone: 'list.rail', kind: 'house', sponsorId: null }],
  ])
  const day = '2026-11-25'
  it('adds one per event to the placement\'s row, with the zone, kind and sponsor from the record', () => {
    const rows = tally([ev('sponsor_placement_measurable'), ev('sponsor_placement_viewable'), ev('sponsor_placement_clicked'), ev('sponsor_placement_measurable', { placement_id: '20', zone: 'list.rail', kind: 'house', sponsor_id: null })], known, day, FILTER_VERSION)
    expect(rows).toEqual([
      { day, placementId: 12, zone: 'home.rail', kind: 'sponsor', sponsorId: 7, filterVersion: FILTER_VERSION, measurable: 1, viewable: 1, clicked: 1 },
      { day, placementId: 20, zone: 'list.rail', kind: 'house', sponsorId: null, filterVersion: FILTER_VERSION, measurable: 1, viewable: 0, clicked: 0 },
    ])
  })
  it('leaves out a placement that is not running, or an event that names the wrong zone, kind or sponsor', () => {
    expect(tally([ev('sponsor_placement_measurable', { placement_id: '99' })], known, day, FILTER_VERSION)).toEqual([])
    expect(tally([ev('sponsor_placement_measurable', { zone: 'list.top' })], known, day, FILTER_VERSION)).toEqual([])
    expect(tally([ev('sponsor_placement_measurable', { kind: 'house' })], known, day, FILTER_VERSION)).toEqual([])
    expect(tally([ev('sponsor_placement_measurable', { sponsor_id: '8' })], known, day, FILTER_VERSION)).toEqual([])
    expect(tally([ev('sponsor_placement_measurable', { sponsor_id: null })], known, day, FILTER_VERSION)).toEqual([])
  })
  it('records no sponsor for a WUWF promotion, whatever the event says', () => {
    const [row] = tally([ev('sponsor_placement_measurable', { placement_id: '20', zone: 'list.rail', kind: 'house', sponsor_id: '7' })], known, day, FILTER_VERSION)
    expect(row!.sponsorId).toBeNull()
  })
})

describe('the report', () => {
  const c = (day: string, placementId: number, m: number, v: number, k: number, over: Partial<CountLike> = {}): CountLike => ({ day, placementId, zone: 'home.rail', measurable: m, viewable: v, clicked: k, filterVersion: FILTER_VERSION, ...over })
  const names = new Map([[12, 'Acme: home rail, December']])

  it('reads days and ranges', () => {
    expect(dayOrNull('2026-11-25')).toBe('2026-11-25')
    for (const bad of ['2026-02-30', '2026-11-5', 'yesterday', '', null]) expect(dayOrNull(bad)).toBeNull()
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(reportRange(null, null, '2026-11-25')).toEqual({ from: '2026-10-27', to: '2026-11-25' })
    expect(reportRange('2026-11-01', '2026-11-03', '2026-11-25')).toEqual({ from: '2026-11-01', to: '2026-11-03' })
    expect(reportRange('2026-11-04', '2026-11-03', '2026-11-25')).toHaveProperty('error')
    expect(reportRange('2025-01-01', '2026-11-03', '2026-11-25')).toHaveProperty('error')
  })
  it('totals each placement and each day, and lists every day of the range', () => {
    const r = buildReport([c('2026-11-01', 12, 100, 60, 3), c('2026-11-03', 12, 50, 20, 1), c('2026-11-03', 13, 5, 2, 0, { zone: 'list.rail' })], names, '2026-11-01', '2026-11-03')
    expect(r.total).toEqual({ measurable: 155, viewable: 82, clicked: 4 })
    expect(r.placements).toEqual([
      { placementId: 12, name: 'Acme: home rail, December', zone: 'home.rail', place: expect.any(String), measurable: 150, viewable: 80, clicked: 4 },
      { placementId: 13, name: 'Placement 13 (deleted)', zone: 'list.rail', place: expect.any(String), measurable: 5, viewable: 2, clicked: 0 },
    ])
    expect(r.days.map((d) => [d.day, d.measurable])).toEqual([['2026-11-01', 100], ['2026-11-02', 0], ['2026-11-03', 55]])
    expect(r.filterVersions).toEqual([FILTER_VERSION])
  })
  it('hides small figures in the sponsor\'s export, and prints how they are counted', () => {
    expect(sponsorFigure(0)).toBe('0')
    expect(sponsorFigure(MIN_REPORTED - 1)).toBe(`fewer than ${MIN_REPORTED}`)
    expect(sponsorFigure(MIN_REPORTED)).toBe(String(MIN_REPORTED))
    const csv = sponsorCsv(buildReport([c('2026-11-01', 12, 1200, 600, 4)], names, '2026-11-01', '2026-11-01'), 'WUWF.org sponsor messages: Acme, "Inc."')
    expect(csv).toContain('"WUWF.org sponsor messages: Acme, ""Inc."""')
    expect(csv).toContain('not audited')
    expect(csv).toContain(FILTER_VERSION)
    expect(csv).toContain('"Acme: home rail, December"') // a name with a comma is quoted
    expect(csv).toContain(',1200,600,fewer than 10,50.0%,\r\n') // a click rate on fewer than 10 clicks is not shown
    expect(csv.endsWith('\r\n')).toBe(true)
  })
})

describe('the beacon sink', () => {
  const setup = () => {
    const posts: { url: string; body: unknown }[] = []
    let leave: () => void = () => {}
    let pending: (() => void) | null = null
    const deps: BeaconDeps = {
      post: (url, body) => (posts.push({ url, body: JSON.parse(body) }), true),
      setTimer: (fn, ms) => {
        expect(ms).toBe(BATCH_WAIT_MS)
        pending = fn
        return 1
      },
      clearTimer: () => {
        pending = null
      },
      onLeave: (fn) => {
        leave = fn
      },
    }
    const sink = createBeaconSink(deps)
    return { sink, posts, leave: () => leave(), fire: () => pending?.() }
  }
  it('waits, then sends a batch in one post to the counter', () => {
    const { sink, posts, fire } = setup()
    sink.send(ev('sponsor_placement_measurable'))
    sink.send(ev('sponsor_placement_measurable', { placement_id: '13' }))
    expect(posts).toEqual([])
    fire()
    expect(posts).toEqual([{ url: COUNTER_PATH, body: { events: [ev('sponsor_placement_measurable'), ev('sponsor_placement_measurable', { placement_id: '13' })] } }])
  })
  it('sends at once when the page is hidden or left, and never twice', () => {
    const { sink, posts, leave, fire } = setup()
    sink.send(ev('sponsor_placement_viewable'))
    leave()
    fire()
    leave()
    expect(posts).toHaveLength(1)
  })
  it('sends a full batch without waiting, and splits what is over a batch', () => {
    const { sink, posts } = setup()
    for (let i = 0; i < MAX_EVENTS; i++) sink.send(ev('sponsor_placement_measurable', { placement_id: String(i + 1) }))
    expect(posts).toHaveLength(1)
    expect((posts[0]!.body as { events: unknown[] }).events).toHaveLength(MAX_EVENTS)
  })
  it('drops a post the browser refuses, without throwing', () => {
    const sink = createBeaconSink({ post: vi.fn(() => { throw new Error('blocked') }), setTimer: () => 1, clearTimer: () => {}, onLeave: () => {} })
    sink.send(ev('sponsor_placement_clicked'))
    expect(() => sink.flush()).not.toThrow()
  })
})
