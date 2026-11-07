import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearLastGood, fetchNowNext } from './cadence'

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
