// Template census CLI. Thin: every rule lives in src/lib/census and is tested there.
//
//   CENSUS_WORK=<dir outside the repo> NODE_USE_ENV_PROXY=1 tsx scripts/census/cli.ts <command> [options]
//
//   plan                         read robots.txt and the sitemaps, write census/plan.json (the order of pages)
//   run --stage <s>              s = pilot (5 pages) | styleguide (10) | main | probe;  --max-pages N  --max-minutes M
//   export | import              write / rebuild the committed files (census/manifest.jsonl, census/tally.json)
//   archive                      zip raw responses not yet archived (work/archives/census-raw-NNN.zip)
//   retally                      rebuild the tally from the raw files kept on disk (after the tally code changes); no requests
//   status                       counts so far
//
// Rules this enforces (owner, 2026-11-02): neutral User-Agent with no contact information, robots.txt honoured,
// requests at least 3 s apart, raw responses outside the repository, a resumable manifest.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'

import { parseRobots, type RobotsPolicy } from '../../src/lib/census/robots'
import { seededShuffle } from '../../src/lib/census/rng'
import { runCensus, tallyGroupOf, ThrottledClient, USER_AGENT, type CensusState, type RunItem } from '../../src/lib/census/runner'
import { assertOutsideRepo, exportArtifacts, importArtifacts, loadState, saveRaw, saveState, writeAtomic } from '../../src/lib/census/state-io'
import { addPage, discoveryCurve, emptyTally } from '../../src/lib/census/tally'
import { classifyPath, DEFAULT_RATES, extractLocs, orderUniverse, pickProbe, sitemapMonths, toPath } from '../../src/lib/census/universe'

// CENSUS_OUT exists so a test run against a fixture server can write somewhere other than the committed folder.
const REPO_CENSUS = process.env.CENSUS_OUT ? resolve(process.env.CENSUS_OUT) : resolve(import.meta.dirname, '../../census')
const SEED = process.env.CENSUS_SEED ?? 'wuwf-census-2026-11-02'
const BASE = process.env.CENSUS_BASE_URL ?? 'https://www.wuwf.org'
const MIN_INTERVAL_MS = 3000

const isLocalBase = (() => {
  const h = new URL(BASE).hostname
  return h === '127.0.0.1' || h === 'localhost'
})()

function fail(msg: string, code = 1): never {
  console.error(msg)
  process.exit(code)
}

if (!isLocalBase && new URL(BASE).hostname !== 'www.wuwf.org') fail(`Refusing base URL ${BASE}: the census fetches www.wuwf.org (or localhost for tests) and nothing else.`)

const args = process.argv.slice(2)
const command = args[0]
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

const WORK = process.env.CENSUS_WORK ?? fail('Set CENSUS_WORK to a directory outside the repository (raw responses and working state live there).')
try {
  assertOutsideRepo(WORK)
} catch (e) {
  fail((e as Error).message)
}
const RAW = join(WORK, 'raw')
const STATE = join(WORK, 'state.json')
const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`)

function client(intervalMs: number): ThrottledClient {
  return new ThrottledClient(
    { fetch, now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), log },
    { baseUrl: BASE, minIntervalMs: intervalMs, maxRetries: 4, backoffBaseMs: 10_000, maxRetryAfterMs: 600_000 },
  )
}

/** The interval never goes under 3 s against the real site; tests against localhost may shorten it. */
function intervalFor(robots: RobotsPolicy | null): number {
  const override = Number(process.env.CENSUS_MIN_INTERVAL_MS)
  if (isLocalBase && Number.isFinite(override) && override >= 0) return override
  return Math.max(MIN_INTERVAL_MS, (robots?.crawlDelaySeconds ?? 0) * 1000)
}

async function readRobots(c: ThrottledClient): Promise<{ robots: RobotsPolicy; interval: number }> {
  const r = await c.get('/robots.txt', 'text/plain')
  if (r.kind !== 'ok' && !(r.kind === 'final' && r.status === 404)) fail(`Could not read robots.txt (${JSON.stringify({ ...r, body: undefined })}). Not fetching anything else.`, 4)
  const text = r.kind === 'ok' ? r.body : ''
  mkdirSync(WORK, { recursive: true })
  writeFileSync(join(WORK, 'robots.txt'), text)
  const robots = parseRobots(text, USER_AGENT)
  log(`robots.txt read (${text.length} bytes); crawl-delay ${robots.crawlDelaySeconds ?? 'none'}`)
  return { robots, interval: intervalFor(robots) }
}

// ---------------------------------------------------------------------------------------------------------------

async function plan(): Promise<void> {
  const boot = client(intervalFor(null))
  const { robots, interval } = await readRobots(boot)
  const c = client(interval)

  const idx = await c.get('/sitemap.xml', 'application/xml')
  if (idx.kind !== 'ok') fail(`Could not read /sitemap.xml: ${idx.kind}`)
  const children = extractLocs(idx.body)
    .map((loc) => ({ loc, path: toPath(loc, [new URL(BASE).hostname]) }))
    .filter((x): x is { loc: string; path: string } => x.path !== null)
  log(`sitemap index lists ${children.length} files`)

  // 2013 on: every monthly sitemap (the first section-prefixed URLs appear in 2013). Before that: two seeded months a
  // year, only to find candidates for the legacy probe. The earlier years are not otherwise in the census.
  const monthly = children.filter((x) => /sitemap-\d{6}\.xml$/.test(x.path))
  const from2013 = monthly.filter((x) => sitemapMonths(x.path) !== null)
  const earlier: typeof monthly = []
  for (let y = 2004; y <= 2012; y++) {
    const ofYear = monthly.filter((x) => x.path.includes(`sitemap-${y}`))
    earlier.push(...seededShuffle(ofYear, `${SEED}|early-months|${y}`).slice(0, 2))
  }
  const wanted = [...earlier, ...from2013]
  log(`fetching ${from2013.length} monthly sitemaps from 2013 on, and ${earlier.length} from 2004-2012 (probe candidates)`)

  const cache = join(WORK, 'sitemaps')
  mkdirSync(cache, { recursive: true })
  const all: string[] = []
  for (const x of wanted) {
    const file = join(cache, x.path.replace(/\W+/g, '_') + '.json')
    if (existsSync(file)) {
      all.push(...(JSON.parse(readFileSync(file, 'utf8')) as string[]))
      continue
    }
    if (!robots.isAllowed(x.path)) {
      log(`robots.txt disallows ${x.path}; skipped`)
      continue
    }
    const r = await c.get(x.path, 'application/xml')
    if (r.kind === 'forbidden') fail('403 from the site. Stopping.', 4)
    if (r.kind !== 'ok') fail(`Could not read ${x.path}: ${r.kind} ${'status' in r ? r.status : ''}. Re-run plan to continue; fetched sitemaps are cached.`, 3)
    const paths = extractLocs(r.body).map((l) => toPath(l, [new URL(BASE).hostname])).filter((p): p is string => p !== null)
    writeFileSync(file, JSON.stringify(paths))
    all.push(...paths)
    log(`${x.path}: ${paths.length} URLs`)
  }

  const unique = [...new Set(all)]
  const ordering = orderUniverse(unique, SEED, DEFAULT_RATES)
  const probe = pickProbe(unique, SEED)
  const doc = {
    seed: SEED,
    base: 'https://www.wuwf.org',
    note: 'main = the stratified sample (year x section) in fetch order. Running past it extends toward the whole local set; re-run plan to regenerate the rest.',
    sitemaps: { monthlyFrom2013: from2013.length, earlierSampled: earlier.map((x) => x.path), urlsRead: unique.length },
    rates: DEFAULT_RATES,
    universe: { localStories: ordering.items.length, strata: ordering.strata },
    sampleSize: ordering.sampleSize,
    main: ordering.items.slice(0, ordering.sampleSize).map(({ path, stratum }) => ({ path, stratum })),
    probe,
  }
  writeAtomic(join(REPO_CENSUS, 'plan.json'), JSON.stringify(doc, null, 1) + '\n')
  const perQuota: Record<string, number> = {}
  for (const p of probe) perQuota[p.stratum] = (perQuota[p.stratum] ?? 0) + 1
  log(`plan written: ${ordering.items.length} local stories in the universe, sample ${ordering.sampleSize}, probe ${probe.length} ${JSON.stringify(perQuota)}`)
}

// ---------------------------------------------------------------------------------------------------------------

function loadWorkState(): CensusState {
  if (existsSync(STATE)) return loadState(STATE, SEED)
  const imported = importArtifacts(REPO_CENSUS, SEED)
  if (imported.rows.length) log(`rebuilt working state from the committed files: ${imported.rows.length} rows`)
  return imported
}

async function run(): Promise<void> {
  const stage = opt('stage') ?? fail('run needs --stage pilot|styleguide|main|probe')
  const planFile = join(REPO_CENSUS, 'plan.json')
  if (!existsSync(planFile)) fail('No census/plan.json. Run `plan` first (or pull it from the branch).')
  const doc = JSON.parse(readFileSync(planFile, 'utf8')) as { seed: string; main: RunItem[]; probe: RunItem[] }
  if (doc.seed !== SEED) fail(`plan.json was made with seed "${doc.seed}", not "${SEED}".`)

  const main: RunItem[] = doc.main.map((m) => ({ ...m, group: 'main' }))
  const probe: RunItem[] = doc.probe.map((m) => ({ ...m, group: 'probe' }))
  const [items, renderer, defaultMax] =
    stage === 'pilot' ? ([main, 'json', 5] as const) : stage === 'styleguide' ? ([main.slice(0, 10), 'styleguide', undefined] as const) : stage === 'main' ? ([main, 'json', undefined] as const) : stage === 'probe' ? ([probe, 'json', undefined] as const) : fail(`Unknown stage ${stage}`)
  const maxPages = opt('max-pages') ? Number(opt('max-pages')) : defaultMax
  const deadline = opt('max-minutes') ? Date.now() + Number(opt('max-minutes')) * 60_000 : Number.POSITIVE_INFINITY

  const state = loadWorkState()
  const boot = client(intervalFor(null))
  const { robots, interval } = await readRobots(boot)
  const c = client(interval)
  const exportEvery = Number(opt('export-every') ?? 100)
  let sinceExport = 0

  log(`stage ${stage}: ${items.length} planned, ${state.rows.length} rows already, interval ${interval} ms, max-pages ${maxPages ?? 'none'}`)
  const result = await runCensus(state, c, {
    items,
    renderer,
    robots,
    maxPages,
    shouldStop: () => Date.now() >= deadline,
    saveRaw: (sha, body) => saveRaw(RAW, sha, body),
    checkpoint: (s) => {
      saveState(STATE, s)
      if (++sinceExport >= exportEvery) {
        exportArtifacts(s, REPO_CENSUS)
        sinceExport = 0
      }
    },
  })
  saveState(STATE, state)
  exportArtifacts(state, REPO_CENSUS)
  log(`stopped: ${result.stopped}; fetched ${result.fetched} this run; ${state.rows.length} rows in all`)
  process.exit(result.stopped === 'failures' ? 3 : result.stopped === 'forbidden' ? 4 : 0)
}

// ---------------------------------------------------------------------------------------------------------------

function archive(): void {
  const doneFile = join(WORK, 'archived.json')
  const done: Record<string, string> = existsSync(doneFile) ? JSON.parse(readFileSync(doneFile, 'utf8')) : {}
  const pending = (existsSync(RAW) ? readdirSync(RAW) : []).filter((f) => f.endsWith('.json.gz') && !done[f]).sort()
  if (!pending.length) return void log('nothing new to archive')
  const dir = join(WORK, 'archives')
  mkdirSync(dir, { recursive: true })
  const PER_ZIP = 600
  const existing = readdirSync(dir).filter((f) => f.endsWith('.zip')).length
  for (let i = 0; i < pending.length; i += PER_ZIP) {
    const part = pending.slice(i, i + PER_ZIP)
    const name = `census-raw-${String(existing + i / PER_ZIP + 1).padStart(3, '0')}.zip`
    // Files are already gzipped, so store them (-0): a second compression pass gains nothing.
    execFileSync('zip', ['-q', '-0', join(dir, name), ...part], { cwd: RAW })
    for (const f of part) done[f] = name
    writeFileSync(doneFile, JSON.stringify(done))
    log(`${name}: ${part.length} files -> ${join(dir, name)}`)
  }
}

/** Rebuild the tally from retained raw responses, in fetch order. Makes no request. */
function retally(): void {
  const state = loadWorkState()
  const tally = emptyTally()
  let n = 0
  for (const r of state.rows) {
    if (!r.tallied) continue
    const file = join(RAW, `${r.sha256}.json.gz`)
    if (!r.rawKept || !r.sha256 || !existsSync(file)) {
      fail(`Cannot re-tally ${r.path}: its raw response is not on disk (an NPR or wire page keeps none, or the sandbox restarted). Nothing was changed.`)
    }
    const info = classifyPath(r.path)
    addPage(tally, tallyGroupOf(r), r.path, JSON.parse(gunzipSync(readFileSync(file)).toString()), { date: info.date, section: info.section })
    n++
  }
  state.tally = tally
  saveState(STATE, state)
  exportArtifacts(state, REPO_CENSUS)
  log(`re-tallied ${n} pages from the raw files`)
}

function status(): void {
  const s = loadWorkState()
  const byStatus: Record<string, number> = {}
  for (const r of s.rows) {
    const k = r.note ? `${r.status ?? '-'} ${r.note.split(':')[0]}` : String(r.status)
    byStatus[k] = (byStatus[k] ?? 0) + 1
  }
  console.log(JSON.stringify({ rows: s.rows.length, byStatus, groups: Object.fromEntries(Object.entries(s.tally.groups).map(([g, t]) => [g, { pages: t.pages, templates: Object.keys(t.templates).length, labels: Object.keys(t.typeLabels).length, shapes: Object.keys(t.shapes).length, tail: discoveryCurve(t).slice(-3) }])) }, null, 1))
}

switch (command) {
  case 'plan':
    await plan()
    break
  case 'run':
    await run()
    break
  case 'export':
    exportArtifacts(loadWorkState(), REPO_CENSUS)
    log('exported')
    break
  case 'import': {
    const s = importArtifacts(REPO_CENSUS, SEED)
    saveState(STATE, s)
    log(`imported ${s.rows.length} rows`)
    break
  }
  case 'archive':
    archive()
    break
  case 'retally':
    retally()
    break
  case 'status':
    status()
    break
  default:
    fail('Commands: plan | run --stage pilot|styleguide|main|probe | export | import | archive | status')
}
