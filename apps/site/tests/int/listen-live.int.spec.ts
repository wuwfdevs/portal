// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { NextRequest } from 'next/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Route handlers run outside Next here, where `unstable_cache` has no cache: run it uncached.
vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/cache')>()),
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

import { GET } from '@/app/(frontend)/listen/now/route'
import { clearLastGood } from '@/lib/live/cadence'
import { liveChannels } from '@/lib/live/channels'

// Listen live (board 26): the channels are settings, validated; "On now" is answered only for a configured channel,
// from Cadence through the server, and falls back to the last good answer.

const FM = 'eed45825-935f-4185-8b47-059fcc96a6a6'
let payload: Payload
let before: unknown
const ctx = { disableRevalidate: true }

const save = (data: Record<string, unknown>) => payload.updateGlobal({ slug: 'listen-live', data: data as never, overrideAccess: true, context: ctx })
const ask = (channel: string) => GET(new NextRequest(`http://localhost/listen/now?channel=${channel}`))

describe('listen live', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    before = await payload.findGlobal({ slug: 'listen-live', overrideAccess: true, depth: 0 })
    await save({
      channels: [
        { name: 'WUWF 88.1', short: '88.1', streamUrl: 'https://wuwf.streamguys1.com/WUWFFM.mp3', cadenceChannelId: FM },
        { name: 'No schedule', streamUrl: 'https://wuwf.streamguys1.com/WUWFHD3.mp3' },
      ],
    })
  }, 90_000)

  afterAll(async () => {
    vi.unstubAllGlobals()
    const { channels, otherWays } = (before ?? {}) as Record<string, unknown>
    await save({ channels: channels ?? [], otherWays: otherWays ?? [] }).catch(() => undefined)
  })

  it('keeps the channels as set, in order', async () => {
    const settings = await payload.findGlobal({ slug: 'listen-live', overrideAccess: true, depth: 0 })
    expect(liveChannels(settings.channels).map((c) => [c.key, c.short])).toEqual([
      [FM, '88.1'],
      ['channel-2', 'No schedule'],
    ])
  })

  it('refuses a stream that is not https, and a malformed Cadence ID', async () => {
    await expect(save({ channels: [{ name: 'Plain', streamUrl: 'http://wuwf.streamguys1.com/WUWFFM.mp3' }] })).rejects.toThrow()
    await expect(save({ channels: [{ name: 'Bad id', streamUrl: 'https://a.example/s.mp3', cadenceChannelId: 'not-an-id' }] })).rejects.toThrow()
  })

  it('answers on now for a configured channel, from Cadence', async () => {
    clearLastGood()
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ onNow: { programName: 'Echoes', start: { utc: '2026-11-07T04:00:00Z' }, end: { utc: '2090-01-01T00:00:00Z' } }, upNext: null }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const res = await ask(FM)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect([json.onNow?.name, json.fresh]).toEqual(['Echoes', true])
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(`https://cadence.nprstations.org/api/cadence/widget/${FM}`)
  })

  it('keeps the last good answer when Cadence is down', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })))
    const json = await (await ask(FM)).json()
    expect([json.onNow?.name, json.fresh]).toEqual(['Echoes', false])
  })

  it('answers nothing for a channel that is not configured, without calling Cadence', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await ask('75d8ec9d-cfc5-45b8-aec9-5bdeb6cd1fd4')).status).toBe(404)
    expect((await ask('../../admin')).status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
