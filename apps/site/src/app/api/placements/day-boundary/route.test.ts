import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls: string[] = []
vi.mock('@/lib/revalidate', () => ({
  revalidateTag: (tag: string) => calls.push(`tag:${tag}`),
  revalidatePath: (path: string, type?: string) => calls.push(`path:${path}${type ? `:${type}` : ''}`),
}))

import { GET } from './route'

const call = (auth?: string) => GET(new Request('https://x.test/api/placements/day-boundary', { headers: auth ? { authorization: auth } : {} }))

describe('the placements day-boundary refresh', () => {
  const saved = process.env.CRON_SECRET
  beforeEach(() => {
    calls.length = 0
  })
  afterEach(() => {
    process.env.CRON_SECRET = saved
  })
  it('answers 401 and refreshes nothing with no secret set, or the wrong one', async () => {
    delete process.env.CRON_SECRET
    expect((await call('Bearer anything')).status).toBe(401)
    process.env.CRON_SECRET = 'right-secret'
    expect((await call()).status).toBe(401)
    expect((await call('Bearer wrong')).status).toBe(401)
    expect(calls).toEqual([])
  })
  it('refreshes the placements tag and the pages that read it with the right secret', async () => {
    process.env.CRON_SECRET = 'right-secret'
    const res = await call('Bearer right-secret')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'refreshed' })
    expect(calls).toEqual(['tag:placements', 'path:/', 'path:/:layout'])
  })
})
