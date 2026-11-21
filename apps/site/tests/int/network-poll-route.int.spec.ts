// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GET, POST } from '@/app/api/network/poll/route'

// The cron route is public by address, so these are the things that keep it harmless: nobody without the secret can run it, and with no CDS key
// it does nothing at all (it does not even open the database). That is why the cron entry in `vercel.json` can be committed before the site has
// real credentials: until `NPR_CDS_TOKEN` is set on the project, every scheduled call is a no-op.

const saved = { secret: process.env.CRON_SECRET, token: process.env.NPR_CDS_TOKEN }
const call = (method: typeof GET, headers: Record<string, string> = {}) => method(new Request('https://www.wuwf.org/api/network/poll', { method: 'GET', headers }))

beforeEach(() => {
  delete process.env.CRON_SECRET
  delete process.env.NPR_CDS_TOKEN
})

afterEach(() => {
  if (saved.secret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = saved.secret
  if (saved.token === undefined) delete process.env.NPR_CDS_TOKEN
  else process.env.NPR_CDS_TOKEN = saved.token
})

describe('/api/network/poll', () => {
  it('answers 401 to everyone when no secret is set, even with a header that looks right', async () => {
    expect((await call(GET)).status).toBe(401)
    expect((await call(GET, { authorization: 'Bearer ' })).status).toBe(401)
    expect((await call(GET, { authorization: 'Bearer undefined' })).status).toBe(401)
  })

  it('answers 401 for a wrong or missing secret, on GET and POST alike', async () => {
    process.env.CRON_SECRET = 'a-long-test-only-secret-value-0123456789'
    expect((await call(GET)).status).toBe(401)
    expect((await call(GET, { authorization: 'Bearer wrong' })).status).toBe(401)
    expect((await call(POST, { authorization: 'a-long-test-only-secret-value-0123456789' })).status).toBe(401)
  })

  it('does nothing, and says so, when the right secret arrives but the site has no CDS key', async () => {
    process.env.CRON_SECRET = 'a-long-test-only-secret-value-0123456789'
    const res = await call(GET, { authorization: 'Bearer a-long-test-only-secret-value-0123456789' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'not_configured' })
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
