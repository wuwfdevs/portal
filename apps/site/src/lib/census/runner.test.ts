// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { parseRobots } from './robots'
import { assertNeutralHeaders, buildHeaders, newState, runCensus, ThrottledClient, USER_AGENT, type RunItem, type CensusState } from './runner'

type Reply = { status: number; body?: string; headers?: Record<string, string> } | Error

const goodPage = (n: number, canonical = 'https://www.wuwf.org/local-news/2016-05-02/s') =>
  JSON.stringify({ _template: 'ArticlePage', contentId: `id-${n}`, sourceOrganizationName: canonical.includes('wuwf') ? 'WUWF' : 'NPR', canonicalLink: canonical, body: [{ _type: 'Figure', src: 'a' }] })

/** A fake network and clock. `sleep` moves the clock, so spacing is measured, not assumed. */
function world(replies: (url: URL, call: number) => Reply) {
  let clock = 1_000_000
  const calls: Array<{ at: number; url: URL; headers: Record<string, string> }> = []
  const sleeps: number[] = []
  const fakeFetch = (async (input: URL | string, init?: RequestInit) => {
    clock += 5 // a request takes a few ms
    const url = new URL(String(input))
    calls.push({ at: clock, url, headers: { ...(init?.headers as Record<string, string>) } })
    const r = replies(url, calls.length)
    if (r instanceof Error) throw r
    return new Response(r.body ?? '', { status: r.status, headers: r.headers })
  }) as typeof fetch
  const deps = {
    fetch: fakeFetch,
    now: () => clock,
    sleep: async (ms: number) => {
      sleeps.push(ms)
      clock += ms
    },
  }
  const client = (over: Partial<ConstructorParameters<typeof ThrottledClient>[1]> = {}) =>
    new ThrottledClient(deps, { baseUrl: 'https://www.wuwf.org', minIntervalMs: 3000, maxRetries: 4, backoffBaseMs: 10_000, maxRetryAfterMs: 600_000, ...over })
  return { calls, sleeps, client }
}

const items = (n: number): RunItem[] => Array.from({ length: n }, (_, i) => ({ path: `/local-news/2016-05-${String(i + 1).padStart(2, '0')}/s${i}`, group: 'main', stratum: '2016/local-news' }))
const allow = parseRobots('User-agent: *\nDisallow:\n', USER_AGENT)
const fixedNow = () => new Date('2026-11-02T18:00:00Z')

describe('what we send', () => {
  it('is a neutral user agent and an accept header, nothing else', () => {
    expect(buildHeaders('application/json')).toEqual({ 'User-Agent': 'WUWF-migration-research', Accept: 'application/json' })
  })

  it.each([
    [{ 'User-Agent': 'WUWF-migration-research (admin@bluffline.org)' }],
    [{ 'User-Agent': 'research-bot https://example.com/bot' }],
    [{ 'User-Agent': 'x', From: 'someone' }],
    [{ 'User-Agent': 'x', Referer: 'y' }],
    [{ 'User-Agent': 'claude-code-session' }],
    [{ 'User-Agent': 'tool.wuwf.org' }],
    [{ 'User-Agent': 'research-bot@somehost' }], // an address with no recognisable domain
    [{ 'User-Agent': 'research-bot http://localhost/contact' }], // a URL with no recognisable domain
    [{ 'User-Agent': 'research-bot ftp://x' }],
  ])('refuses %j', (headers) => {
    expect(() => assertNeutralHeaders(headers as Record<string, string>)).toThrow()
  })

  it('puts exactly those headers on the wire', async () => {
    const w = world(() => ({ status: 200, body: '{}', headers: { 'content-type': 'application/json' } }))
    await w.client().get('/a?_renderer=json')
    expect(w.calls[0]?.headers).toEqual({ 'User-Agent': 'WUWF-migration-research', Accept: 'application/json' })
  })
})

describe('spacing', () => {
  it('never starts a request less than 3 seconds after the previous one started', async () => {
    const w = world(() => ({ status: 200, body: goodPage(1), headers: { 'content-type': 'application/json' } }))
    const state = newState('s')
    await runCensus(state, w.client(), { items: items(6), renderer: 'json', robots: allow, now: fixedNow })
    expect(w.calls).toHaveLength(6)
    for (let i = 1; i < w.calls.length; i++) expect((w.calls[i]!.at) - (w.calls[i - 1]!.at)).toBeGreaterThanOrEqual(3000)
  })

  it('spaces redirect hops and retries too', async () => {
    const w = world((_url, n): Reply =>
      n === 1 ? { status: 301, headers: { location: '/moved?_renderer=json' } } : n === 2 ? { status: 503 } : { status: 200, body: '{}', headers: { 'content-type': 'application/json' } },
    )
    await w.client({ backoffBaseMs: 1000 }).get('/a?_renderer=json')
    expect(w.calls).toHaveLength(3)
    for (let i = 1; i < w.calls.length; i++) expect(w.calls[i]!.at - w.calls[i - 1]!.at).toBeGreaterThanOrEqual(3000)
  })

  it('honours a larger interval (a Crawl-delay) when one is configured', async () => {
    const w = world(() => ({ status: 404 }))
    const c = w.client({ minIntervalMs: 7000 })
    await c.get('/a')
    await c.get('/b')
    expect(w.calls[1]!.at - w.calls[0]!.at).toBeGreaterThanOrEqual(7000)
  })
})

describe('errors', () => {
  it('retries a 429 and 5xx with doubling backoff, then succeeds', async () => {
    const w = world((_u, n) => (n <= 2 ? { status: n === 1 ? 429 : 503 } : { status: 200, body: '{}', headers: { 'content-type': 'application/json' } }))
    const r = await w.client().get('/a')
    expect(r.kind).toBe('ok')
    expect(w.sleeps.filter((ms) => ms >= 10_000)).toEqual([10_000, 20_000])
  })

  it('waits for Retry-After when it asks for more than the backoff, capped', async () => {
    const w = world((_u, n) => (n === 1 ? { status: 429, headers: { 'retry-after': '90' } } : n === 2 ? { status: 429, headers: { 'retry-after': '99999' } } : { status: 200, body: '{}' }))
    await w.client({ maxRetryAfterMs: 120_000 }).get('/a')
    expect(w.sleeps).toContain(90_000)
    expect(w.sleeps).toContain(120_000)
  })

  it('gives up after the retries and reports a failure', async () => {
    const w = world(() => new Error('socket hang up'))
    const r = await w.client().get('/a')
    expect(r).toMatchObject({ kind: 'failed', status: null })
    expect(w.calls).toHaveLength(5) // first try + 4 retries
  })

  it('treats 404 as an answer, not a failure, and does not retry it', async () => {
    const w = world(() => ({ status: 404 }))
    expect(await w.client().get('/a')).toMatchObject({ kind: 'final', status: 404 })
    expect(w.calls).toHaveLength(1)
  })

  it('stops at once on 403', async () => {
    const w = world(() => ({ status: 403 }))
    const state = newState('s')
    const out = await runCensus(state, w.client(), { items: items(5), renderer: 'json', robots: allow, now: fixedNow })
    expect(out.stopped).toBe('forbidden')
    expect(w.calls).toHaveLength(1)
    expect(state.rows).toHaveLength(0) // not recorded as done, so a later run tries it again
  })

  it('stops after five pages in a row fail, and a later run retries them instead of duplicating rows', async () => {
    let healthy = false
    const w = world(() => (healthy ? { status: 200, body: goodPage(1), headers: { 'content-type': 'application/json' } } : { status: 500 }))
    const state = newState('s')
    const first = await runCensus(state, w.client({ maxRetries: 0 }), { items: items(8), renderer: 'json', robots: allow, now: fixedNow })
    expect(first.stopped).toBe('failures')
    expect(state.rows).toHaveLength(5)
    expect(state.rows.every((r) => r.note?.startsWith('failed'))).toBe(true)

    healthy = true
    const second = await runCensus(state, w.client({ maxRetries: 0 }), { items: items(8), renderer: 'json', robots: allow, now: fixedNow })
    expect(second.stopped).toBe('done')
    expect(state.rows).toHaveLength(8)
    expect(new Set(state.rows.map((r) => r.path)).size).toBe(8)
    expect(state.rows.some((r) => r.note?.startsWith('failed'))).toBe(false)
  })

  it('resets the failure count when the server answers, even with a 404', async () => {
    const w = world((_u, n) => (n % 5 === 0 ? { status: 404 } : { status: 500 }))
    const state = newState('s')
    const out = await runCensus(state, w.client({ maxRetries: 0 }), { items: items(9), renderer: 'json', robots: allow, now: fixedNow })
    expect(out.stopped).toBe('done')
  })
})

describe('robots and redirects', () => {
  it('does not request a path that robots.txt disallows, and says so in the manifest', async () => {
    const w = world(() => ({ status: 200, body: goodPage(1), headers: { 'content-type': 'application/json' } }))
    const robots = parseRobots('User-agent: *\nDisallow: /local-news/2016-05-02', USER_AGENT)
    const state = newState('s')
    await runCensus(state, w.client(), { items: items(3), renderer: 'json', robots, now: fixedNow })
    expect(w.calls).toHaveLength(2)
    expect(state.rows.find((r) => r.path.includes('2016-05-02'))).toMatchObject({ status: null, note: 'robots-disallowed', tallied: false })
  })

  it('follows a redirect on the same host and records where it landed', async () => {
    const w = world((url): Reply =>
      url.pathname === '/a' ? { status: 301, headers: { location: 'https://www.wuwf.org/b' } } : { status: 200, body: goodPage(1), headers: { 'content-type': 'application/json' } },
    )
    const r = await w.client().get('/a?_renderer=json')
    expect(r).toMatchObject({ kind: 'ok', finalPath: '/b' })
    expect(w.calls[1]!.url.search).toBe('?_renderer=json')
  })

  it('does not follow a redirect to another host', async () => {
    const w = world(() => ({ status: 302, headers: { location: 'https://www.npr.org/x' } }))
    const r = await w.client().get('/a')
    expect(r).toMatchObject({ kind: 'final', status: 302 })
    expect(w.calls).toHaveLength(1)
  })
})

describe('what is kept', () => {
  it('keeps raw JSON for WUWF pages and not for NPR pages, but records both in the manifest', async () => {
    const w = world((url) => ({ status: 200, body: goodPage(url.pathname.length, url.pathname.includes('s1') ? 'https://www.npr.org/2026/x/nx-s1-1234567/y' : undefined), headers: { 'content-type': 'application/json' } }))
    const saved: string[] = []
    const state = newState('s')
    await runCensus(state, w.client(), { items: items(3), renderer: 'json', robots: allow, saveRaw: (sha) => saved.push(sha), now: fixedNow })
    expect(state.rows).toHaveLength(3)
    expect(saved).toHaveLength(2)
    const npr = state.rows.find((r) => r.origin === 'external')!
    expect(npr).toMatchObject({ rawKept: false, tallied: true })
    expect(saved).not.toContain(npr.sha256)
  })

  it('records a non-JSON 200 without tallying it', async () => {
    const w = world(() => ({ status: 200, body: '<html>nope</html>', headers: { 'content-type': 'text/html' } }))
    const state = newState('s')
    await runCensus(state, w.client(), { items: items(1), renderer: 'json', robots: allow, now: fixedNow })
    expect(state.rows[0]).toMatchObject({ note: 'not-json', tallied: false })
    expect(state.tally.groups['main']).toBeUndefined()
  })

  it('tallies styleguide pages in their own group so they do not skew the main curve', async () => {
    const w = world(() => ({ status: 200, body: goodPage(1), headers: { 'content-type': 'application/json' } }))
    const state = newState('s')
    await runCensus(state, w.client(), { items: items(2), renderer: 'styleguide', robots: allow, now: fixedNow })
    expect(Object.keys(state.tally.groups)).toEqual(['main:styleguide'])
  })
})

describe('resuming', () => {
  const body = (url: URL) => goodPage(url.pathname.length + url.pathname.charCodeAt(url.pathname.length - 1))
  const reply = (url: URL): Reply => ({ status: 200, body: body(url), headers: { 'content-type': 'application/json' } })

  it('gives the same state whether run in one go or in chunks that are killed and restarted from a saved copy', async () => {
    const list = items(11)

    const whole = newState('s')
    await runCensus(whole, world(reply).client(), { items: list, renderer: 'json', robots: allow, now: fixedNow })

    let saved: CensusState = newState('s')
    for (const chunk of [3, 3, 3, 5]) {
      const restored: CensusState = JSON.parse(JSON.stringify(saved)) // a fresh process loading the checkpoint
      await runCensus(restored, world(reply).client(), { items: list, renderer: 'json', robots: allow, maxPages: chunk, now: fixedNow, checkpoint: (s) => (saved = JSON.parse(JSON.stringify(s))) })
    }
    expect(saved.rows).toHaveLength(11)
    expect(saved).toEqual(whole)
  })

  it('does not fetch a page it already has', async () => {
    const state = newState('s')
    await runCensus(state, world(reply).client(), { items: items(4), renderer: 'json', robots: allow, now: fixedNow })
    const again = world(reply)
    await runCensus(state, again.client(), { items: items(4), renderer: 'json', robots: allow, now: fixedNow })
    expect(again.calls).toHaveLength(0)
    expect(state.tally.groups['main']!.pages).toBe(4)
  })

  it('ends a chunk cleanly when asked to (a wall-clock limit), leaving the rest for the next run', async () => {
    const w = world(reply)
    let asked = 0
    const state = newState('s')
    const out = await runCensus(state, w.client(), { items: items(10), renderer: 'json', robots: allow, shouldStop: () => ++asked > 3, now: fixedNow })
    expect(out).toEqual({ stopped: 'time', fetched: 3 })
    expect(state.rows).toHaveLength(3)
  })

  it('stops at maxPages and says why', async () => {
    const w = world(reply)
    const out = await runCensus(newState('s'), w.client(), { items: items(10), renderer: 'json', robots: allow, maxPages: 4, now: fixedNow })
    expect(out).toEqual({ stopped: 'max-pages', fetched: 4 })
  })
})
