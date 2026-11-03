// A small, polite probe of Grove's live-updates pages (the owner approved a census of `/live-updates/` on 2026-11-03).
// Same rules as the template census, enforced by the same client: neutral User-Agent with no contact information,
// robots.txt honoured, one request at a time and at least 3 s apart, raw responses outside the repository.
//
//   CENSUS_WORK=<dir outside the repo> NODE_USE_ENV_PROXY=1 pnpm exec tsx scripts/live-updates/probe.ts list
//   CENSUS_WORK=<dir outside the repo> NODE_USE_ENV_PROXY=1 pnpm exec tsx scripts/live-updates/probe.ts fetch <path> [<path>...]
//   CENSUS_WORK=<dir outside the repo> NODE_USE_ENV_PROXY=1 pnpm exec tsx scripts/live-updates/probe.ts discover
//
// `list` reads robots.txt and the section's listing page and prints the live-updates addresses it links to.
// `fetch` saves the JSON view of each path given. `discover` reads the sitemaps (the XML lists only, no story pages) and
// writes every `/live-updates/` address they contain to <work>/live-updates/addresses.txt. Nothing is written to the repository.

import crypto from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

import { parseRobots } from '../../src/lib/census/robots'
import { ThrottledClient, USER_AGENT } from '../../src/lib/census/runner'
import { extractLocs, toPath } from '../../src/lib/census/universe'
import { assertOutsideRepo } from '../../src/lib/census/state-io'

const BASE = 'https://www.wuwf.org'
const WORK = process.env.CENSUS_WORK
if (!WORK) throw new Error('Set CENSUS_WORK to a directory outside the repository.')
assertOutsideRepo(WORK)
const RAW = join(WORK, 'live-updates')
mkdirSync(RAW, { recursive: true })

const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`)
const client = new ThrottledClient(
  { fetch, now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), log },
  { baseUrl: BASE, minIntervalMs: 3000, maxRetries: 4, backoffBaseMs: 10_000, maxRetryAfterMs: 600_000 },
)

const robotsRes = await client.get('/robots.txt', 'text/plain')
const robots = parseRobots(robotsRes.kind === 'ok' ? robotsRes.body : '', USER_AGENT)
log(`robots.txt read; crawl-delay ${robots.crawlDelaySeconds ?? 'none'}`)

async function save(path: string): Promise<{ status: string; bytes?: number; sha?: string; body?: string }> {
  const pq = `${path}${path.includes('?') ? '&' : '?'}_renderer=json`
  if (!robots.isAllowed(pq)) return { status: 'disallowed by robots.txt' }
  const r = await client.get(pq, 'application/json')
  if (r.kind !== 'ok') return { status: r.kind === 'final' ? `HTTP ${r.status}${'note' in r && r.note ? ` (${r.note})` : ''}` : r.kind }
  const sha = crypto.createHash('sha256').update(r.body).digest('hex')
  writeFileSync(join(RAW, `${sha}.json.gz`), gzipSync(r.body))
  writeFileSync(join(RAW, `${sha}.path`), path)
  return { status: 'ok', bytes: r.body.length, sha, body: r.body }
}

const [command, ...rest] = process.argv.slice(2)
if (command === 'list') {
  const r = await save('/live-updates')
  console.log('listing page:', r.status, r.bytes ?? '', r.sha ?? '')
  if (r.body) {
    const found = new Set<string>()
    for (const m of r.body.matchAll(/(?:https?:\/\/(?:www\.)?wuwf\.org)?(\/live-updates\/[A-Za-z0-9_-]+)/g)) found.add(m[1]!)
    console.log(`addresses linked (${found.size}):`)
    for (const p of [...found].sort()) console.log('  ' + p)
  }
} else if (command === 'fetch') {
  for (const path of rest) {
    const r = await save(path)
    console.log(`${r.status.padEnd(8)} ${String(r.bytes ?? '').padStart(9)}  ${r.sha?.slice(0, 12) ?? ''}  ${path}`)
  }
} else if (command === 'discover') {
  const idx = await client.get('/sitemap.xml', 'application/xml')
  if (idx.kind !== 'ok') throw new Error(`Could not read /sitemap.xml: ${idx.kind}`)
  const sitemaps = extractLocs(idx.body).map((l) => toPath(l)).filter((p): p is string => !!p && robots.isAllowed(p))
  log(`${sitemaps.length} sitemap files to read`)
  const found = new Map<string, string>()
  let n = 0
  for (const sm of sitemaps) {
    const r = await client.get(sm, 'application/xml')
    n++
    if (r.kind !== 'ok') {
      log(`skipped ${sm}: ${r.kind === 'final' ? `HTTP ${r.status}` : r.kind}`)
      continue
    }
    for (const loc of extractLocs(r.body)) {
      const p = toPath(loc)
      if (p && p.startsWith('/live-updates/')) found.set(p, sm)
    }
    if (n % 25 === 0) log(`${n}/${sitemaps.length} read; ${found.size} live-updates addresses so far`)
  }
  writeFileSync(join(RAW, 'addresses.txt'), [...found].map(([p, sm]) => `${p}\t${sm}`).sort().join('\n') + '\n')
  log(`done: ${found.size} live-updates addresses`)
} else throw new Error('Usage: probe.ts list | fetch <path>... | discover')
