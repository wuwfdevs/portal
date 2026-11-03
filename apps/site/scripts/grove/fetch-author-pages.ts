// Fetches Grove's own author page for each person the migrated stories credit whose page is not yet among the downloaded
// pages. Needs the owner's approval for wuwf.org (given for the exact list printed by the dry run, not in general).
//
//   pnpm exec tsx scripts/grove/fetch-author-pages.ts --raw ~/grove/raw                 # dry run: prints the addresses, fetches nothing
//   pnpm exec tsx scripts/grove/fetch-author-pages.ts --raw ~/grove/raw --go            # fetches them
//
// Same rules as the census: neutral User-Agent with no contact information, robots.txt honoured, one request at a time and at
// least 3 s apart, stops on a refusal. Pages are saved under <raw>/authors as `*.json.gz` (outside the repository), which is
// where `import.ts --raw` already looks. Run again: pages already downloaded are not requested twice.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'

import { parseRobots } from '../../src/lib/census/robots'
import { ThrottledClient, USER_AGENT } from '../../src/lib/census/runner'
import { assertOutsideRepo } from '../../src/lib/census/state-io'
import { convertAuthorPage, convertStory } from '../../src/lib/grove'

const args = process.argv.slice(2)
const rawDirs = args.flatMap((a, i) => (a === '--raw' ? [args[i + 1] ?? ''] : []))
const go = args.includes('--go')
if (!rawDirs.length) throw new Error('Pass --raw <dir> (the raw census pages).')
rawDirs.forEach((d) => assertOutsideRepo(path.resolve(d)))

const files: string[] = []
const walk = (d: string) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.json.gz')) files.push(p)
  }
}
rawDirs.forEach(walk)
files.sort()

const credited = new Map<string, { name: string; stories: number }>()
const have = new Set<string>()
for (const f of files) {
  const page: unknown = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'))
  const s = convertStory(page, { embedHosts: [] })
  if (s.status === 'converted') {
    for (const p of s.story.byline.people) {
      if (!p.slug) continue
      const seen = credited.get(p.slug) ?? { name: p.name, stories: 0 }
      seen.stories += 1
      credited.set(p.slug, seen)
    }
    continue
  }
  const a = convertAuthorPage(page)
  if (a.status === 'converted') have.add(a.author.slug)
}
const missing = [...credited.entries()].filter(([slug]) => !have.has(slug)).sort((a, b) => b[1].stories - a[1].stories)
console.log(`${credited.size} credited people have a Grove address; ${have.size} author pages already downloaded; ${missing.length} to fetch:`)
for (const [slug, v] of missing) console.log(`  /people/${slug}  (${v.name}, ${v.stories} stories)`)
if (!go) {
  console.log('\nDry run: nothing was requested. Add --go to fetch these pages from www.wuwf.org (3 seconds apart).')
  process.exit(0)
}
if (!missing.length) process.exit(0)

const BASE = 'https://www.wuwf.org'
const out = path.join(path.resolve(rawDirs[0]!), 'authors')
fs.mkdirSync(out, { recursive: true })
const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`)
const client = new ThrottledClient(
  { fetch, now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), log },
  { baseUrl: BASE, minIntervalMs: 3000, maxRetries: 4, backoffBaseMs: 10_000, maxRetryAfterMs: 600_000 },
)
const robotsRes = await client.get('/robots.txt', 'text/plain')
if (robotsRes.kind !== 'ok') throw new Error('robots.txt could not be read; not fetching anything.')
const robots = parseRobots(robotsRes.body, USER_AGENT)

let ok = 0
const problems: string[] = []
for (const [slug] of missing) {
  const pq = `/people/${slug}?_renderer=json`
  if (!robots.isAllowed(pq)) {
    problems.push(`${slug}: disallowed by robots.txt`)
    continue
  }
  const r = await client.get(pq, 'application/json')
  if (r.kind === 'forbidden') {
    // The server saying no is not something to push against: stop, and ask the owner.
    problems.push(`${slug}: HTTP ${r.status}`, 'stopped: the server answered 403; not pushing on')
    break
  }
  if (r.kind !== 'ok') {
    problems.push(`${slug}: ${r.kind === 'final' ? `HTTP ${r.status}` : r.kind === 'failed' ? r.error : 'not fetched'}`)
    continue
  }
  const sha = crypto.createHash('sha256').update(r.body).digest('hex')
  fs.writeFileSync(path.join(out, `${sha}.json.gz`), zlib.gzipSync(r.body))
  ok += 1
  log(`saved /people/${slug}`)
}
console.log(`\nfetched ${ok} of ${missing.length}${problems.length ? `; problems:\n  ${problems.join('\n  ')}` : ''}`)
