// A smoke test for the whole acknowledgment loop against a RUNNING PRODUCTION BUILD (`pnpm build && pnpm start`),
// because only a production server caches pages the way a reader gets them; `pnpm dev` re-renders every request.
//
//   pnpm smoke:agreement
//
// It signs in through the real Portal sign-in route with a freshly minted token, checks that reuse, and an edit
// without login, are refused, edits agreement 1 as a sponsorship user, confirms the cached story page shows the
// new wording, and restores the original. Needs the demonstration data (`pnpm seed:demo`). It leaves one staff
// account behind (loop-...@wuwf.org); delete it from the admin. Refuses any host but localhost.

import dotenv from 'dotenv'
import { mintIdentityToken } from '@wuwf/portal-contracts'
dotenv.config({ path: '.env.local' })

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
if (!['localhost', '127.0.0.1'].includes(new URL(BASE).hostname)) throw new Error(`Refusing to run against ${BASE}: localhost only.`)
const first = (await (await fetch(`${BASE}/api/posts?limit=1&depth=0&where[_status][equals]=published`)).json()) as { docs?: { slug: string }[] }
const slug = first.docs?.[0]?.slug
if (!slug) throw new Error('No published story found. Run `pnpm seed:demo` first.')
const ORIGINAL = "Reporting through WUWF's Coastal Futures Fellowship is made possible in part by support from Example Foundation."
const EDITED = 'Coastal Futures is supported in part by Example Foundation (edited through the live API).'

const panel = async () => {
  const html = await (await fetch(`${BASE}/posts/${slug}`)).text()
  const m = html.match(/Support for this reporting<\/h2>\s*<div[^>]*>\s*<p[^>]*>([^<]*)</)
  return m?.[1]?.replace(/&#x27;|&apos;/g, "'").replace(/&amp;/g, '&') ?? '(no panel found)'
}

console.log('1. reader sees:        ', await panel())

const token = await mintIdentityToken(
  { userId: crypto.randomUUID(), email: `loop-${Date.now()}@wuwf.org`, name: 'Loop Test', roles: ['sponsorship'] },
  process.env.PORTAL_IDENTITY_SECRET!,
)
const sso = await fetch(`${BASE}/api/portal/sso?token=${encodeURIComponent(token)}`, { redirect: 'manual' })
const cookie = (sso.headers.get('set-cookie') ?? '').split(';')[0]!
console.log('2. SSO status:         ', sso.status, '→', sso.headers.get('location'), '| cookie set:', cookie.startsWith('wuwf_staff='))

const replay = await fetch(`${BASE}/api/portal/sso?token=${encodeURIComponent(token)}`, { redirect: 'manual' })
console.log('3. same token again:   ', replay.status, '(must be 401)')

const patch = (text: string) => fetch(`${BASE}/api/underwriting-agreements/1`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ text }) })
const noAuth = await fetch(`${BASE}/api/underwriting-agreements/1`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'hacked' }) })
console.log('4. edit without login: ', noAuth.status, '(must be 403)')

const edit = await patch(EDITED)
console.log('5. edit as sponsorship:', edit.status, '(must be 200)')
console.log('6. reader now sees:    ', await panel())

await patch(ORIGINAL)
console.log('7. restored, reader:   ', await panel())
process.exit(0)
