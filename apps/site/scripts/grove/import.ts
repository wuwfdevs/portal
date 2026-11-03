// The importer: Grove's WUWF-originated stories into Payload, with their pictures, audio and video copied into our own
// library. Two phases, each safe to stop and run again.
//
//   pnpm exec tsx scripts/grove/import.ts --raw <dir> [--raw <dir>...] --cache <dir> --phase fetch
//   pnpm exec tsx scripts/grove/import.ts --raw <dir> [--raw <dir>...] --cache <dir> --phase save [--limit 20] [--dry-run]
//
//   --raw        the unzipped census pages (outside the repository)
//   --cache      where downloaded files and the ledger live (outside the repository); the fetch phase writes it, the save
//                phase reads it. Nothing is downloaded twice: the ledger (`assets.jsonl`) remembers every address.
//   --phase      fetch | save | all (default all)
//   --interval-ms  minimum gap between requests (default 3000, never lower)
//   --retry-failed fetch again the files whose last attempt failed (a missing or refused file is not retried)
//   --limit      save at most this many stories (a trial run)
//   --dry-run    save phase: say what would be saved, write nothing
//   --allow-remote  required to save into a database that is not on this machine; the host is printed first
//
// Rules it keeps: the converter's output is the only input (no scraping here); a story whose files are not all in the
// library is held, never saved pointing at nothing; a story that is already in (matched by Grove id) is left alone; a
// library record that already exists for a source address is reused; real dates and the exact path are kept.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

const args = process.argv.slice(2)
const flag = (n: string) => args.flatMap((a, i) => (a === `--${n}` ? [args[i + 1] ?? ''] : []))
const has = (n: string) => args.includes(`--${n}`)

const raw = flag('raw')
const cache = flag('cache')[0]
const phase = flag('phase')[0] ?? 'all'
const intervalMs = Math.max(3000, Number(flag('interval-ms')[0] ?? 3000))
const limit = flag('limit')[0] ? Number(flag('limit')[0]) : Infinity
const dryRun = has('dry-run')
if (!raw.length || !cache) throw new Error('Pass --raw <dir> and --cache <dir>.')
if (!['fetch', 'save', 'all'].includes(phase)) throw new Error('--phase is fetch, save or all.')

const { convertStory, resolveAssets, planImport, sectionTitlesBySegment } = await import('../../src/lib/grove')
type ConvertedStory = import('../../src/lib/grove').ConvertedStory
type AssetRef = import('../../src/lib/grove').AssetRef
const { assertOutsideRepo } = await import('../../src/lib/census/state-io')
const { AssetDownloader, DEFAULT_OPTIONS, mimeFor } = await import('../../src/lib/assets/download')

assertOutsideRepo(path.resolve(cache))
fs.mkdirSync(path.join(cache, 'files'), { recursive: true })

// ---- 1. convert everything -----------------------------------------------------------------------------------------

const pages: string[] = []
const walk = (d: string) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.json.gz')) pages.push(p)
  }
}
raw.forEach(walk)
pages.sort()

const stories: ConvertedStory[] = []
const held: { path: string; why: string }[] = []
for (const f of pages) {
  const r = convertStory(JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8')), { embedHosts: [] })
  if (r.status !== 'converted') continue
  if (r.report.status === 'exception') held.push({ path: r.story.path, why: 'converter exception' })
  else stories.push(r.story)
}
stories.sort((a, b) => a.path.localeCompare(b.path))
console.log(`converted ${stories.length} stories (${held.length} held for a converter exception)`)

const assets = new Map<string, AssetRef>()
for (const s of stories) for (const a of s.assets) if (!assets.has(a.sourceUrl)) assets.set(a.sourceUrl, a)
console.log(`${assets.size} distinct files across ${stories.reduce((n, s) => n + s.assets.length, 0)} uses`)

// ---- the ledger: one JSON line per attempt, the last line for an address wins ------------------------------------------

type Entry =
  | { sourceUrl: string; status: 'ok'; sha256: string; bytes: number; contentType: string; at: string }
  | { sourceUrl: string; status: 'missing'; httpStatus: number; at: string }
  | { sourceUrl: string; status: 'refused'; reason: string; at: string }
  | { sourceUrl: string; status: 'failed'; error: string; at: string }
const ledgerFile = path.join(cache, 'assets.jsonl')
const ledger = new Map<string, Entry>()
if (fs.existsSync(ledgerFile)) {
  for (const line of fs.readFileSync(ledgerFile, 'utf8').split('\n')) {
    if (!line.trim()) continue
    const e = JSON.parse(line) as Entry
    ledger.set(e.sourceUrl, e)
  }
}
const record = (e: Entry) => {
  ledger.set(e.sourceUrl, e)
  fs.appendFileSync(ledgerFile, JSON.stringify(e) + '\n')
}

// ---- 2. fetch --------------------------------------------------------------------------------------------------------------

async function fetchPhase() {
  const retryFailed = has('retry-failed')
  const todo = [...assets.values()].filter((a) => {
    const e = ledger.get(a.sourceUrl)
    return !e || (e.status === 'failed' && retryFailed)
  })
  console.log(`fetch: ${todo.length} to download, ${assets.size - todo.length} already in the ledger; about ${Math.round((todo.length * intervalMs) / 60000)} minutes at ${intervalMs / 1000}s a file`)
  const dl = new AssetDownloader(
    { fetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: Date.now, log: (m) => console.log(`  ${m}`) },
    { ...DEFAULT_OPTIONS, minIntervalMs: intervalMs },
  )
  let stop = false
  process.on('SIGINT', () => {
    console.log('\nstopping after this file (the ledger is saved)...')
    stop = true
  })
  let n = 0
  let forbidden = 0
  for (const a of todo) {
    if (stop) break
    const r = await dl.download(a.sourceUrl, a.kind)
    const at = new Date().toISOString()
    if (r.status === 'ok') {
      forbidden = 0
      const file = path.join(cache, 'files', r.sha256)
      if (!fs.existsSync(file)) fs.writeFileSync(file, r.data)
      record({ sourceUrl: a.sourceUrl, status: 'ok', sha256: r.sha256, bytes: r.bytes, contentType: r.contentType, at })
    } else if (r.status === 'missing') record({ sourceUrl: a.sourceUrl, status: 'missing', httpStatus: r.httpStatus, at })
    else if (r.status === 'refused') {
      record({ sourceUrl: a.sourceUrl, status: 'refused', reason: r.reason, at })
      // The server saying no to us is not something to push against: five in a row and we stop and ask.
      forbidden = r.reason === 'forbidden' ? forbidden + 1 : 0
      if (forbidden >= 5) {
        console.log('stopping: five files in a row were refused with 403. Do not retry; ask the owner.')
        break
      }
    } else record({ sourceUrl: a.sourceUrl, status: 'failed', error: r.error, at })
    if (++n % 25 === 0) console.log(`fetch: ${n}/${todo.length}`)
  }
  const counts: Record<string, number> = {}
  for (const a of assets.values()) counts[ledger.get(a.sourceUrl)?.status ?? 'not yet'] = (counts[ledger.get(a.sourceUrl)?.status ?? 'not yet'] ?? 0) + 1
  console.log('fetch: ledger now', counts)
}

// ---- 3. save ---------------------------------------------------------------------------------------------------------------

async function savePhase() {
  const dbHost = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/none').hostname
  const local = ['localhost', '127.0.0.1', '::1', 'db'].includes(dbHost)
  console.log(`save: database host ${dbHost}${dryRun ? ' (dry run: nothing is written)' : ''}`)
  if (!local && !has('allow-remote')) throw new Error(`Refusing to save into ${dbHost}: it is not on this machine. Pass --allow-remote if the owner has approved this target.`)

  const titles = sectionTitlesBySegment(stories)

  // Which stories can be saved: every file must be in the ledger as downloaded.
  const ready: ConvertedStory[] = []
  for (const s of stories) {
    const bad = s.assets.filter((a) => ledger.get(a.sourceUrl)?.status !== 'ok')
    if (bad.length) held.push({ path: s.path, why: `${bad.length} file(s) not fetched: ${bad.slice(0, 2).map((a) => `${ledger.get(a.sourceUrl)?.status ?? 'not yet'} ${a.sourceUrl}`).join('; ')}` })
    else ready.push(s)
  }
  console.log(`save: ${ready.length} stories have all their files; ${held.length} held`)

  const noteCounts = new Map<string, number>()
  if (dryRun) {
    for (const s of ready) for (const n of planImport(s, titles).notes) noteCounts.set(n.code, (noteCounts.get(n.code) ?? 0) + 1)
    summary(0, 0, noteCounts)
    return
  }

  const { getPayload } = await import('payload')
  const config = (await import('../../src/payload.config')).default
  const payload = await getPayload({ config })
  const ctx = { disableRevalidate: true }

  const find = async (collection: 'media' | 'audio' | 'video' | 'posts' | 'sections' | 'categories' | 'contributors', where: Record<string, unknown>) =>
    (await payload.find({ collection, where: where as never, limit: 1, depth: 0, overrideAccess: true })).docs[0]

  const libraryId = async (a: AssetRef): Promise<number | string> => {
    const collection = a.kind === 'image' ? 'media' : a.kind
    const existing = await find(collection, { 'legacy.sourceUrl': { equals: a.sourceUrl } })
    if (existing) return existing.id
    const e = ledger.get(a.sourceUrl)
    if (e?.status !== 'ok') throw new Error(`no downloaded file for ${a.sourceUrl}`)
    const data = fs.readFileSync(path.join(cache, 'files', e.sha256))
    const mimetype = mimeFor(a.kind, e.contentType, a.sourceUrl)
    if (!mimetype) throw new Error(`cannot tell what kind of file ${a.sourceUrl} is (${e.contentType})`)
    const name = decodeURIComponent(new URL(a.sourceUrl).pathname.split('/').pop() || `${a.kind}-${e.sha256.slice(0, 8)}`)
    const file = { data, mimetype, name, size: data.length }
    const legacy = { sourceUrl: a.sourceUrl }
    const doc =
      a.kind === 'image'
        ? await payload.create({ collection: 'media', overrideAccess: true, context: ctx, file, data: { alt: a.alt ?? '', ...(a.credit ? { credit: a.credit } : {}), ...(a.source ? { source: a.source } : {}), legacy } as never })
        : a.kind === 'audio'
          ? await payload.create({ collection: 'audio', overrideAccess: true, context: ctx, file, data: { title: a.title ?? name, ...(a.description ? { description: a.description } : {}), ...(a.credit ? { credit: a.credit } : {}), ...(a.durationSeconds ? { durationSeconds: a.durationSeconds } : {}), legacy } as never })
          : await payload.create({ collection: 'video', overrideAccess: true, context: ctx, file, data: { title: a.title ?? name, ...(a.description ? { description: a.description } : {}), ...(a.credit ? { credit: a.credit } : {}), legacy } as never })
    return doc.id
  }

  const findOrCreate = async (collection: 'sections' | 'categories' | 'contributors', field: string, value: string, data: Record<string, unknown>) => {
    const found = await find(collection, { [field]: { equals: value } })
    return found ? found.id : (await payload.create({ collection, data: data as never, overrideAccess: true, context: ctx })).id
  }

  let saved = 0
  let already = 0
  const failures: { path: string; error: string }[] = []
  for (const s of ready) {
    if (saved >= limit) break
    try {
      if (await find('posts', { 'legacy.groveId': { equals: s.legacy.groveId } })) {
        already++
        continue
      }
      const plan = planImport(s, titles)
      const ids = new Map<string, number | string>()
      for (const a of s.assets) ids.set(a.sourceUrl, await libraryId(a))
      const resolved = resolveAssets({ content: s.content, featuredMedia: s.featuredMedia, featuredAudio: s.featuredAudio, people: plan.people }, ids)

      const section = plan.section ? await findOrCreate('sections', 'slug', plan.section.slug, { title: plan.section.title, slug: plan.section.slug }) : undefined
      const categories: (number | string)[] = []
      for (const t of s.topics) categories.push(await findOrCreate('categories', 'title', t.title, { title: t.title }))
      const contributors: (number | string)[] = []
      for (const p of resolved.people) {
        contributors.push(await findOrCreate('contributors', 'name', p.name, { name: p.name, ...(p.title ? { title: p.title } : {}), ...(p.bio ? { bio: p.bio } : {}), ...(p.photo ? { photo: p.photo } : {}) }))
      }

      await payload.create({
        collection: 'posts',
        overrideAccess: true,
        context: ctx,
        data: {
          title: s.title,
          slug: s.slug,
          path: s.path,
          publishedAt: s.publishedAt,
          source: s.source,
          ...(section ? { section } : {}),
          categories,
          contributors,
          meta: { description: s.description },
          legacy: { legacyPath: s.legacy.legacyPath, groveId: s.legacy.groveId, modifiedAt: s.legacy.modifiedAt },
          content: resolved.content,
          featuredMedia: resolved.featuredMedia,
          ...(resolved.featuredAudio ? { featuredAudio: resolved.featuredAudio } : {}),
          _status: 'published',
        } as never,
      })
      for (const n of plan.notes) noteCounts.set(n.code, (noteCounts.get(n.code) ?? 0) + 1)
      if (++saved % 25 === 0) console.log(`save: ${saved} stories`)
    } catch (e) {
      failures.push({ path: s.path, error: (e as Error).message.slice(0, 300) })
      console.log(`FAILED ${s.path}: ${(e as Error).message.slice(0, 200)}`)
    }
  }
  summary(saved, already, noteCounts, failures)
  process.exit(failures.length ? 1 : 0)
}

function summary(saved: number, already: number, notes: Map<string, number>, failures: { path: string; error: string }[] = []) {
  const out = {
    saved,
    alreadyThere: already,
    held: held.length,
    failed: failures.length,
    decisions: Object.fromEntries([...notes].sort()),
    heldStories: held.slice(0, 40),
    failures,
  }
  const file = path.join(cache, 'import-report.json')
  fs.writeFileSync(file, JSON.stringify(out, null, 1))
  console.log(JSON.stringify({ ...out, heldStories: `${held.length} (see ${file})` }, null, 1))
}

if (phase === 'fetch' || phase === 'all') await fetchPhase()
if (phase === 'save' || phase === 'all') await savePhase()
if (phase === 'fetch') process.exit(0)
