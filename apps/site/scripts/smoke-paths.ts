// A smoke test for the URL scheme against a RUNNING site (`pnpm dev` or `pnpm build && pnpm start`), localhost only:
//
//   pnpm smoke:paths
//
// Checks what a reader and a crawler get: a story at its path, the trailing-slash redirect, the placeholder gone,
// reserved and malformed requests handled without a 500, and the permanent redirect an editor's address change leaves.
// Needs the demonstration data (`pnpm seed:demo`). It signs in through the real Portal sign-in route as a publisher
// (leaving one staff account behind, loop-...@wuwf.org) and puts every address it changes back.

import dotenv from 'dotenv'
import { mintIdentityToken } from '@wuwf/portal-contracts'
dotenv.config({ path: '.env.local' })

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
if (!['localhost', '127.0.0.1'].includes(new URL(BASE).hostname)) throw new Error(`Refusing to run against ${BASE}: localhost only.`)

let failures = 0
const check = (name: string, ok: boolean, detail: string) => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}  ${detail}`)
}
const get = (path: string, init: RequestInit = {}) => fetch(`${BASE}${path}`, { redirect: 'manual', ...init })

const listed = (await (await fetch(`${BASE}/api/posts?limit=1&depth=0&where[_status][equals]=published&where[path][exists]=true`)).json()) as {
  docs?: { id: number; path: string; slug: string; title: string }[]
}
const story = listed.docs?.[0]
if (!story) throw new Error('No published story with a path found. Run `pnpm seed:demo` first.')
const P = story.path

// --- what a reader gets
const page = await get(P)
const html = await page.text()
check('story at its path', page.status === 200 && html.includes(story.title.slice(0, 20).replace(/&/g, '&amp;')), `${page.status} ${P}`)
const canon = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
check('canonical is the path itself', Boolean(canon && canon.endsWith(P)), String(canon))

const slash = await get(`${P}/`)
check('trailing slash redirects (308) to the path', slash.status === 308 && (slash.headers.get('location') ?? '').replace(BASE, '') === P, `${slash.status} -> ${slash.headers.get('location')}`)
check('the /posts/<slug> placeholder is gone', (await get(`/posts/${story.slug}`)).status === 404, '')
check('a path under no record is a 404', (await get('/nothing/2026-01-01/here')).status === 404, '')
check('a path is case-sensitive', (await get(P.toUpperCase())).status === 404, '')
check('half a path is a 404', (await get(P.split('/').slice(0, 3).join('/'))).status === 404, '')
check('home page still served', (await get('/')).status === 200, '')
check('a static route still beats the catch-all (/support)', (await get('/support')).status === 200, '')
check('/search still served', (await get('/search')).status === 200, '')
check('the draft-preview address is closed without the preview cookie', (await get(`/_draft/posts/${story.id}`)).status === 404, '')
for (const hostile of ['/%2e%2e/etc/passwd', '/a//b', `/${'x'.repeat(2000)}`, '/a%00b', '/a%2Fb']) {
  const r = await get(hostile)
  check(`hostile request is not a 500: ${hostile.slice(0, 30)}`, r.status < 500, String(r.status))
}
// Malformed percent-encoding: Next itself answers 400 in development and 500 in production, before any of our code runs.
const malformed = await get('/a/%E0%A4%A')
console.log(`note  malformed percent-encoding (/a/%E0%A4%A) -> ${malformed.status} (framework behaviour; ${malformed.status < 500 ? 'fine' : 'a 500 in production, known'})`)
check('the API is not shadowed', (await get('/api/posts?limit=1')).status === 200, '')

// --- what an address change leaves behind
const token = await mintIdentityToken(
  { userId: crypto.randomUUID(), email: `loop-${Date.now()}@wuwf.org`, name: 'Path Smoke', roles: ['publisher'] },
  process.env.PORTAL_IDENTITY_SECRET!,
)
const sso = await get(`/api/portal/sso?token=${encodeURIComponent(token)}`)
const cookie = (sso.headers.get('set-cookie') ?? '').split(';')[0]!
check('signed in as a publisher through the Portal route', cookie.startsWith('wuwf_staff='), String(sso.status))
const patch = (id: number, path: string) => fetch(`${BASE}/api/posts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ path }) })
const P2 = `${P}-moved`
const moved = await patch(story.id, P2)
check('a publisher can move a live story', moved.status === 200, String(moved.status))
// the redirects list is cached by tag and refreshed by the save; give the server a moment
let old = await get(P)
for (let i = 0; i < 10 && old.status !== 308; i++) {
  await new Promise((r) => setTimeout(r, 500))
  old = await get(P)
}
// Next sends the Location header twice for a redirect rendered inside a cached page (Next 16.3.3). Browsers, Node and curl
// all follow it, but the HTTP spec makes Location a single value, so say so rather than pass it silently.
const locations = [...new Set((old.headers.get('location') ?? '').split(', ').map((l) => l.replace(BASE, '')))]
check('the old address redirects permanently (308) to the new', old.status === 308 && locations.length === 1 && locations[0] === P2, `${old.status} -> ${locations.join(' | ')}`)
if ((old.headers.get('location') ?? '').includes(', ')) console.log('note  Next sent the Location header twice (same value). Followed correctly by browsers, Node and curl; non-standard.')
check('the new address serves the story', (await get(P2)).status === 200, '')

const back = await patch(story.id, P)
check('moved back', back.status === 200, String(back.status))
let again = await get(P)
for (let i = 0; i < 10 && again.status !== 200; i++) {
  await new Promise((r) => setTimeout(r, 500))
  again = await get(P)
}
check('the original address serves the story again (no redirect loop)', again.status === 200, String(again.status))

// tidy: the redirect left from P2 back to P
const left = (await (await fetch(`${BASE}/api/redirects?where[from][equals]=${encodeURIComponent(P2)}&depth=0`, { headers: { Cookie: cookie } })).json()) as { docs?: { id: number }[] }
for (const r of left.docs ?? []) await fetch(`${BASE}/api/redirects/${r.id}`, { method: 'DELETE', headers: { Cookie: cookie } })

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
