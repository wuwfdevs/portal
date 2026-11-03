import { describe, expect, it } from 'vitest'

import { AssetDownloader, DEFAULT_OPTIONS, mimeFor, typeMatches } from './download'

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

function harness(routes: Record<string, () => Response>) {
  const calls: { url: string; headers: Record<string, string> }[] = []
  const sleeps: number[] = []
  let t = 0
  const fetchFn = (async (input: URL | string, init?: RequestInit) => {
    const u = String(input)
    calls.push({ url: u, headers: (init?.headers ?? {}) as Record<string, string> })
    t += 10
    const r = routes[u]
    if (!r) return new Response('nope', { status: 404 })
    return r()
  }) as typeof fetch
  const d = new AssetDownloader({ fetch: fetchFn, sleep: async (ms) => { sleeps.push(ms); t += ms }, now: () => t }, { ...DEFAULT_OPTIONS, backoffBaseMs: 100 })
  return { d, calls, sleeps }
}
const ok = (body: Buffer | string = png, type = 'image/png', extra: Record<string, string> = {}) => () => new Response(body, { status: 200, headers: { 'content-type': type, ...extra } })
const NO_ROBOTS = { 'https://cdn.example.org/robots.txt': () => new Response('', { status: 404 }) }

describe('typeMatches', () => {
  it('accepts the right family and a generic type, and refuses a page', () => {
    expect(typeMatches('image', 'image/jpeg')).toBe(true)
    expect(typeMatches('audio', 'audio/mpeg; charset=x')).toBe(true)
    expect(typeMatches('video', 'video/mp4')).toBe(true)
    expect(typeMatches('image', 'application/octet-stream')).toBe(true)
    expect(typeMatches('image', 'text/html')).toBe(false)
    expect(typeMatches('audio', 'image/png')).toBe(false)
  })
})

describe('AssetDownloader', () => {
  it('downloads a file and reports its hash, size and type', async () => {
    const { d } = harness({ ...NO_ROBOTS, 'https://cdn.example.org/a.png': ok() })
    const r = await d.download('https://cdn.example.org/a.png', 'image')
    expect(r).toMatchObject({ status: 'ok', bytes: png.length, contentType: 'image/png' })
    if (r.status === 'ok') expect(r.sha256).toMatch(/^[0-9a-f]{64}$/)
  })
  it('sends only a neutral User-Agent and Accept, and spaces requests at least 3 s apart', async () => {
    const { d, calls, sleeps } = harness({ ...NO_ROBOTS, 'https://cdn.example.org/a.png': ok(), 'https://cdn.example.org/b.png': ok() })
    await d.download('https://cdn.example.org/a.png', 'image')
    await d.download('https://cdn.example.org/b.png', 'image')
    for (const c of calls) expect(Object.keys(c.headers).sort()).toEqual(['Accept', 'User-Agent'])
    expect(JSON.stringify(calls.map((c) => c.headers))).not.toMatch(/@|claude|anthropic|session|https?:/i)
    expect(sleeps.filter((s) => s >= 2900).length).toBeGreaterThanOrEqual(2)
    // robots.txt was fetched once for the host, not once per file
    expect(calls.filter((c) => c.url.endsWith('/robots.txt'))).toHaveLength(1)
  })
  it('obeys robots.txt', async () => {
    const { d, calls } = harness({ 'https://cdn.example.org/robots.txt': () => new Response('User-agent: *\nDisallow: /private/', { status: 200 }), 'https://cdn.example.org/private/a.png': ok() })
    expect(await d.download('https://cdn.example.org/private/a.png', 'image')).toEqual({ status: 'refused', reason: 'robots' })
    expect(calls.some((c) => c.url.includes('/private/a.png'))).toBe(false)
  })
  it('refuses plain http and private hosts without a request', async () => {
    const { d, calls } = harness({})
    expect(await d.download('http://cdn.example.org/a.png', 'image')).toEqual({ status: 'refused', reason: 'not_https' })
    expect(await d.download('https://192.168.0.4/a.png', 'image')).toEqual({ status: 'refused', reason: 'private_host' })
    expect(calls).toHaveLength(0)
  })
  it('reports a 404 or 410 as missing, not as a failure', async () => {
    const { d } = harness({ ...NO_ROBOTS, 'https://cdn.example.org/gone.png': () => new Response('', { status: 410 }) })
    expect(await d.download('https://cdn.example.org/gone.png', 'image')).toEqual({ status: 'missing', httpStatus: 410 })
    expect(await d.download('https://cdn.example.org/none.png', 'image')).toEqual({ status: 'missing', httpStatus: 404 })
  })
  it('stops and says so on a 403, and never retries it', async () => {
    const { d, calls } = harness({ ...NO_ROBOTS, 'https://cdn.example.org/a.png': () => new Response('', { status: 403 }) })
    expect(await d.download('https://cdn.example.org/a.png', 'image')).toEqual({ status: 'refused', reason: 'forbidden' })
    expect(calls.filter((c) => c.url.endsWith('a.png'))).toHaveLength(1)
  })
  it('retries a 503 with backoff and then succeeds', async () => {
    let n = 0
    const { d, sleeps } = harness({ ...NO_ROBOTS, 'https://cdn.example.org/a.png': () => (++n < 3 ? new Response('', { status: 503 }) : ok()()) })
    expect((await d.download('https://cdn.example.org/a.png', 'image')).status).toBe('ok')
    expect(n).toBe(3)
    expect(sleeps).toContain(100)
    expect(sleeps).toContain(200)
  })
  it('gives up after the retries and reports a failure', async () => {
    const { d } = harness({ ...NO_ROBOTS, 'https://cdn.example.org/a.png': () => new Response('', { status: 500 }) })
    expect(await d.download('https://cdn.example.org/a.png', 'image')).toEqual({ status: 'failed', error: 'HTTP 500' })
  })
  it('follows a redirect, checking the new address again', async () => {
    const { d } = harness({
      ...NO_ROBOTS,
      'https://cdn.example.org/a.png': () => new Response('', { status: 301, headers: { location: 'https://cdn.example.org/b.png' } }),
      'https://cdn.example.org/b.png': ok(),
    })
    const r = await d.download('https://cdn.example.org/a.png', 'image')
    expect(r).toMatchObject({ status: 'ok', finalUrl: 'https://cdn.example.org/b.png' })
    const h2 = harness({ ...NO_ROBOTS, 'https://cdn.example.org/a.png': () => new Response('', { status: 302, headers: { location: 'http://cdn.example.org/b.png' } }) })
    expect(await h2.d.download('https://cdn.example.org/a.png', 'image')).toEqual({ status: 'refused', reason: 'not_https' })
    const h3 = harness({ ...NO_ROBOTS, 'https://cdn.example.org/a.png': () => new Response('', { status: 302, headers: { location: 'https://10.0.0.1/x' } }) })
    expect(await h3.d.download('https://cdn.example.org/a.png', 'image')).toEqual({ status: 'refused', reason: 'private_host' })
  })
  it('refuses a web page where a picture should be, and a file over the size cap', async () => {
    const { d } = harness({
      ...NO_ROBOTS,
      'https://cdn.example.org/page': ok('<html></html>', 'text/html'),
      'https://cdn.example.org/huge.png': ok(png, 'image/png', { 'content-length': String(500 * 1024 * 1024) }),
    })
    expect(await d.download('https://cdn.example.org/page', 'image')).toEqual({ status: 'refused', reason: 'wrong_type' })
    expect(await d.download('https://cdn.example.org/huge.png', 'image')).toEqual({ status: 'refused', reason: 'too_big' })
  })
  it('does not remember a robots.txt it could not read: it tries again for the next file', async () => {
    let n = 0
    const { d } = harness({ 'https://cdn.example.org/robots.txt': () => (++n === 1 ? new Response('', { status: 503 }) : new Response('', { status: 404 })), 'https://cdn.example.org/a.png': ok() })
    expect((await d.download('https://cdn.example.org/a.png', 'image')).status).toBe('failed')
    expect((await d.download('https://cdn.example.org/a.png', 'image')).status).toBe('ok')
  })
})

describe('mimeFor', () => {
  it('uses the server type, falls back to the extension for a generic one, and is null when neither says', () => {
    expect(mimeFor('image', 'image/jpeg; x=y', 'https://c.example.org/a')).toBe('image/jpeg')
    expect(mimeFor('audio', 'application/octet-stream', 'https://c.example.org/talk.MP3?x=1')).toBe('audio/mpeg')
    expect(mimeFor('image', '', 'https://c.example.org/noext')).toBeNull()
    expect(mimeFor('image', 'application/octet-stream', 'https://c.example.org/talk.mp3')).toBeNull()
  })
})
