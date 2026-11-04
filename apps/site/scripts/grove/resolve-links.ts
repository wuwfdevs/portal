// Builds the link map for `convertStory({ linkMap })`: for every own-site link in a migrated story that points at a page this site
// will not have, where the link should go instead. A wire story answers 410 here, and Grove 301s an old `/post/<slug>` address to the
// story's current one; neither can be worked out from the address alone, so each distinct target is asked of Grove once.
//
//   pnpm exec tsx scripts/grove/resolve-links.ts --raw <dir> [--raw <dir>...] --cache <file> --out census/url-inventory/link-map.json \
//        [--dry-run] [--max <n>]
//
// `--raw` takes folders of `*.json.gz` Grove pages (the unzipped census archives), as `convert-corpus.ts` does.
// `--cache` is a JSON file OUTSIDE the repository that remembers every answer, so a stopped run resumes where it was.
// `--dry-run` converts and counts; it makes no request. Without it, the run asks Grove one address at a time.
//
// Rules (the census's, owner-approved 2026-11-04): the neutral User-Agent with no contact information, robots.txt read first and honoured,
// at least 3 s between requests, a same-host redirect followed so that the answer is the page a reader would reach, a 403 stops the run
// at once, and nothing is written into the repository except the map.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

import { classifyOrigin } from '../../src/lib/census/tally'
import { parseRobots } from '../../src/lib/census/robots'
import { ThrottledClient, USER_AGENT } from '../../src/lib/census/runner'
import { convertStory, internalLinks, linkKind } from '../../src/lib/grove'

const args = process.argv.slice(2)
const flag = (name: string): string[] => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1] ?? ''] : []))
const rawDirs = flag('raw')
const cachePath = flag('cache')[0]
const outPath = flag('out')[0]
const dryRun = args.includes('--dry-run')
const max = Number(flag('max')[0] ?? Infinity)
if (!rawDirs.length) throw new Error('Pass --raw <dir> (the unzipped census pages).')
if (!dryRun && (!cachePath || !outPath)) throw new Error('Pass --cache <file outside the repository> and --out <map file>.')
if (cachePath && path.resolve(cachePath).startsWith(path.resolve(import.meta.dirname, '../..'))) throw new Error('--cache must be outside the repository.')

const BASE = 'https://www.wuwf.org'
const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`)

// ---- 1. convert every page and collect the own-site links -----------------------------------------------------------------

const files: string[] = []
const collect = (dir: string) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) collect(p)
    else if (e.name.endsWith('.json.gz')) files.push(p)
  }
}
for (const d of rawDirs) collect(d)
files.sort()

const migrated = new Set<string>()
const linkedFrom = new Map<string, Set<string>>()
let stories = 0
for (const f of files) {
  const r = convertStory(JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8')), { embedHosts: [] })
  if (r.status !== 'converted') continue
  stories++
  migrated.add(r.story.path)
  for (const l of internalLinks(r.story.content)) {
    if (!linkedFrom.has(l)) linkedFrom.set(l, new Set())
    linkedFrom.get(l)!.add(r.story.path)
  }
}

/** Only these shapes are asked about: the ones that are, or may be, a page this site will not have. Other pages are not stories. */
const toResolve = [...linkedFrom.keys()].filter((p) => {
  const k = linkKind(p)
  return (k === 'wire' || k === 'legacy-post' || k === 'section-story') && !migrated.has(p)
})
const byKind: Record<string, number> = {}
for (const p of linkedFrom.keys()) byKind[linkKind(p)] = (byKind[linkKind(p)] ?? 0) + 1
log(`${stories} stories from ${files.length} pages; ${linkedFrom.size} distinct own-site links ${JSON.stringify(byKind)}; ${toResolve.length} to ask Grove about (not in the migrated set)`)
if (dryRun) process.exit(0)

// ---- 2. ask Grove, one address at a time, remembering every answer --------------------------------------------------------

type Answer =
  | { result: 'external'; to: string }
  | { result: 'moved'; to: string }
  | { result: 'own' }
  | { result: 'ambiguous'; organization: string | null }
  | { result: 'gone'; status: number }
  | { result: 'unreadable'; note: string }
const cache: Record<string, Answer> = cachePath && fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {}
const save = () => fs.writeFileSync(cachePath!, JSON.stringify(cache, null, 1))

const client = new ThrottledClient(
  { fetch, now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), log },
  { baseUrl: BASE, minIntervalMs: 3000, maxRetries: 3, backoffBaseMs: 10_000, maxRetryAfterMs: 120_000 },
)
const robotsRes = await client.get('/robots.txt', 'text/plain')
if (robotsRes.kind !== 'ok' && !(robotsRes.kind === 'final' && robotsRes.status === 404)) throw new Error('Could not read robots.txt; not fetching anything else.')
const robots = parseRobots(robotsRes.kind === 'ok' ? robotsRes.body : '', USER_AGENT)

let asked = 0
let failures = 0
for (const p of toResolve) {
  if (cache[p] && cache[p]!.result !== 'unreadable') continue
  if (asked >= max) break
  const target = `${p}?_renderer=json`
  if (!robots.isAllowed(target)) {
    cache[p] = { result: 'unreadable', note: 'robots.txt disallows it' }
    continue
  }
  const r = await client.get(target)
  asked++
  if (r.kind === 'forbidden') {
    save()
    throw new Error(`Grove answered 403 at ${p}. Stopping; do not push on, ask the owner.`)
  }
  if (r.kind === 'failed') {
    cache[p] = { result: 'unreadable', note: r.error }
    if (++failures >= 5) {
      save()
      throw new Error('Five failures in a row. Stopping.')
    }
    continue
  }
  failures = 0
  if (r.kind === 'final') {
    cache[p] = r.status === 404 || r.status === 410 ? { result: 'gone', status: r.status } : { result: 'unreadable', note: `HTTP ${r.status}${r.note ? ` ${r.note}` : ''}` }
  } else {
    try {
      const j = JSON.parse(r.body) as Record<string, unknown>
      const canonical = typeof j.canonicalLink === 'string' ? j.canonicalLink : ''
      const organization = typeof j.sourceOrganizationName === 'string' && j.sourceOrganizationName ? j.sourceOrganizationName : null
      const url = new URL(canonical)
      const origin = classifyOrigin({ organization, canonicalHost: url.hostname })
      const there = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : url.pathname
      if (origin === 'external') cache[p] = { result: 'external', to: canonical }
      else if (origin === 'ambiguous') cache[p] = { result: 'ambiguous', organization }
      else cache[p] = there !== p ? { result: 'moved', to: there } : { result: 'own' }
    } catch (e) {
      cache[p] = { result: 'unreadable', note: `not readable: ${(e as Error).message}` }
    }
  }
  if (asked % 10 === 0) {
    save()
    log(`asked ${asked} of ${toResolve.length}`)
  }
}
save()

// ---- 3. write the map -----------------------------------------------------------------------------------------------------

const map: Record<string, string | null> = {}
const counts: Record<string, number> = {}
for (const p of toResolve) {
  const a = cache[p]
  if (!a) continue
  counts[a.result] = (counts[a.result] ?? 0) + 1
  if (a.result === 'external' || a.result === 'moved') map[p] = a.to
  else if (a.result === 'gone') map[p] = null
}
const links: Record<string, number> = {}
for (const p of Object.keys(map)) links[p] = linkedFrom.get(p)?.size ?? 0
const doc = {
  note: 'path -> where a link to it should go (an address), or null to remove the link and keep its words. Built by scripts/grove/resolve-links.ts; no page content.',
  stories,
  asked: toResolve.length,
  answers: counts,
  map,
  storiesLinking: links,
  needsDecision: Object.fromEntries(toResolve.filter((p) => cache[p]?.result === 'ambiguous' || cache[p]?.result === 'unreadable').map((p) => [p, cache[p]])),
}
fs.writeFileSync(outPath!, JSON.stringify(doc, null, 1) + '\n')
log(`map written: ${Object.keys(map).length} entries ${JSON.stringify(counts)}`)
