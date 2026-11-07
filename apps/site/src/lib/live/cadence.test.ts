import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearLastGood, fetchNowNext, fetchWeek } from './cadence'

const ID = 'eed45825-935f-4185-8b47-059fcc96a6a6'
const body = {
  onNow: { programName: 'Echoes', start: { utc: '2026-11-07T04:00:00Z' }, end: { utc: '2026-11-07T05:59:00Z' } },
  upNext: null,
}
const ok = (json: unknown) => vi.fn(async () => new Response(JSON.stringify(json), { status: 200 })) as unknown as typeof fetch

describe('fetchNowNext', () => {
  afterEach(() => {
    clearLastGood()
    vi.restoreAllMocks()
  })

  it('reads the channel from Cadence', async () => {
    const f = ok(body)
    const r = await fetchNowNext(ID, f)
    expect(r.fresh).toBe(true)
    expect(r.data.onNow?.name).toBe('Echoes')
    expect((f as unknown as { mock: { calls: [string][] } }).mock.calls[0][0]).toBe(`https://cadence.nprstations.org/api/cadence/widget/${ID}`)
  })

  it('never builds an address from anything but a channel ID', async () => {
    const f = ok(body)
    const r = await fetchNowNext('../admin?x=1', f)
    expect(r).toEqual({ data: { onNow: null, upNext: null }, fresh: false })
    expect(f).not.toHaveBeenCalled()
  })

  it('falls back to the last good answer when Cadence fails, and to nothing before that', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const down = vi.fn(async () => new Response('nope', { status: 503 })) as unknown as typeof fetch
    expect((await fetchNowNext(ID, down)).data).toEqual({ onNow: null, upNext: null })
    await fetchNowNext(ID, ok(body))
    const r = await fetchNowNext(ID, down)
    expect([r.fresh, r.data.onNow?.name]).toEqual([false, 'Echoes'])
  })
})

describe('fetchWeek', () => {
  afterEach(() => {
    clearLastGood()
    vi.restoreAllMocks()
  })

  const week = {
    total: 1,
    episodes: [{ episode: { programName: 'Morning Edition', priority: 0, start: { utc: '2026-11-02T11:00:00Z' }, end: { utc: '2026-11-02T15:00:00Z' } } }],
  }

  it('asks Cadence for the channel and dates in the body, as its weekly widget does', async () => {
    const f = ok(week)
    const r = await fetchWeek(ID, '2026-11-02', '2026-11-08', f)
    expect(r.programs.map((p) => p.name)).toEqual(['Morning Edition'])
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe('https://cadence.nprstations.org/api/cadence/widget/')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ channelId: ID, startDate: '2026-11-02', endDate: '2026-11-08', from: 0, size: 1000 })
  })

  it('refuses anything but a channel ID and real dates', async () => {
    const f = ok(week)
    expect((await fetchWeek('x', '2026-11-02', '2026-11-08', f)).programs).toEqual([])
    expect((await fetchWeek(ID, '2026-11-02"}', '2026-11-08', f)).programs).toEqual([])
    expect(f).not.toHaveBeenCalled()
  })

  it('keeps the last good week when Cadence fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await fetchWeek(ID, '2026-11-02', '2026-11-08', ok(week))
    const down = vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch
    const r = await fetchWeek(ID, '2026-11-02', '2026-11-08', down)
    expect([r.fresh, r.programs.length]).toEqual([false, 1])
  })
})
