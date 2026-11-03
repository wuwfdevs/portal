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
//   --upgrade-http <address>  fetch phase: request the https:// version of this one exact http:// address (repeatable); nothing else is upgraded
//   --limit      save at most this many stories (a trial run)
//   --sample N   work on N stories spread evenly across the whole set (a rehearsal slice), in both phases
//   --kinds      fetch phase: only these kinds of file, e.g. image or image,audio (default: all)
//   --min-free-gib  fetch phase: stop cleanly when the disk holding --cache has less than this free (default 3)
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
// A failed Payload save says only "The following field is invalid"; the reason sits in the error's data. Say it, so a person can decide.
const why = (e: unknown): string => {
  const err = e as { message?: string; data?: { errors?: { path?: string; message?: string }[] } }
  const detail = (err.data?.errors ?? []).map((x) => `${x.path ?? '?'}: ${x.message ?? '?'}`).join('; ')
  return `${err.message ?? String(e)}${detail ? ` [${detail}]` : ''}`.slice(0, 500)
}

const raw = flag('raw')
const cache = flag('cache')[0]
const phase = flag('phase')[0] ?? 'all'
const intervalMs = Math.max(3000, Number(flag('interval-ms')[0] ?? 3000))
const limit = flag('limit')[0] ? Number(flag('limit')[0]) : Infinity
const dryRun = has('dry-run')
if (!raw.length || !cache) throw new Error('Pass --raw <dir> and --cache <dir>.')
if (!['fetch', 'save', 'all'].includes(phase)) throw new Error('--phase is fetch, save or all.')

const { convertStory, convertContentPage, convertAuthorPage, convertEventPage, convertShowPage, resolveAssets, planImport, sectionTitlesBySegment, splitAuthorsByStories } = await import('../../src/lib/grove')
type ConvertedPage = import('../../src/lib/grove').ConvertedPage
type ConvertedShow = import('../../src/lib/grove').ConvertedShow
type ConvertedEvent = import('../../src/lib/grove').ConvertedEvent
type ConvertedAuthor = import('../../src/lib/grove').ConvertedAuthor
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
const standardPages: ConvertedPage[] = []
const shows: ConvertedShow[] = []
const events: ConvertedEvent[] = []
const authors: ConvertedAuthor[] = []
for (const f of pages) {
  const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'))
  const r = convertStory(raw, { embedHosts: [] })
  if (r.status !== 'converted') {
    // Not a story: it may be a show (a radio program's own page) or a standard page (a title and a body).
    const sh = convertShowPage(raw)
    if (sh.status === 'converted') {
      if (sh.report.status === 'exception') held.push({ path: sh.show.path, why: 'show converter exception' })
      else shows.push(sh.show)
      continue
    }
    // A community-calendar event.
    const ev = convertEventPage(raw)
    if (ev.status === 'converted') {
      if (ev.report.status === 'exception') held.push({ path: ev.event.path, why: 'event converter exception' })
      else events.push(ev.event)
      continue
    }
    // An author's own page (`/people/<slug>`).
    const au = convertAuthorPage(raw)
    if (au.status === 'converted') {
      if (au.report.status === 'exception') held.push({ path: au.author.path, why: 'author converter exception' })
      else authors.push(au.author)
      continue
    }
    const pg = convertContentPage(raw)
    if (pg.status !== 'converted') continue
    if (pg.report.status === 'exception') held.push({ path: pg.page.path, why: 'page converter exception' })
    else standardPages.push(pg.page)
    continue
  }
  if (r.report.status === 'exception') held.push({ path: r.story.path, why: 'converter exception' })
  else stories.push(r.story)
}
standardPages.sort((a, b) => a.path.localeCompare(b.path))
authors.sort((a, b) => a.path.localeCompare(b.path))
stories.sort((a, b) => a.path.localeCompare(b.path))
const sampleN = flag('sample')[0] ? Number(flag('sample')[0]) : 0
if (sampleN > 0 && sampleN < stories.length) {
  // Evenly spaced, so the slice covers every year and section the set does, and the same N always picks the same stories.
  const step = stories.length / sampleN
  const picked = Array.from({ length: sampleN }, (_, i) => stories[Math.floor(i * step)]!)
  stories.splice(0, stories.length, ...picked)
  console.log(`--sample ${sampleN}: working on ${stories.length} stories spread across the set`)
}
// Only people a migrated station story credits get a profile; the rest are skipped by rule (see import-rules.ts).
const split = splitAuthorsByStories(authors, stories)
authors.splice(0, authors.length, ...split.keep)
const authorsSkipped = split.skipped.map((x) => x.path)
if (authorsSkipped.length) console.log(`authors: ${authorsSkipped.length} skipped, no migrated station story credits them`)
console.log(`converted ${stories.length} stories, ${shows.length} shows, ${standardPages.length} standard pages, ${events.length} events and ${authors.length} author profiles (${held.length} held for a converter exception)`)

const assets = new Map<string, AssetRef>()
for (const s of [...stories, ...standardPages, ...shows, ...events, ...authors]) for (const a of s.assets) if (!assets.has(a.sourceUrl)) assets.set(a.sourceUrl, a)
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
  // `--upgrade-http <exact address>` (repeatable): ask for the https:// version of one named http:// file. Nothing else is upgraded.
  const upgrade = new Set(flag('upgrade-http'))
  for (const u of upgrade) if (!u.startsWith('http://')) throw new Error(`--upgrade-http takes an exact http:// address, got: ${u}`)
  const kinds = (flag('kinds')[0] ?? 'image,audio,video').split(',')
  const minFreeBytes = Number(flag('min-free-gib')[0] ?? 3) * 1024 ** 3
  const freeBytes = () => {
    const st = fs.statfsSync(cache)
    return st.bavail * st.bsize
  }
  const todo = [...assets.values()].filter((a) => {
    if (!kinds.includes(a.kind)) return false
    const e = ledger.get(a.sourceUrl)
    if (upgrade.has(a.sourceUrl)) return !e || (e.status === 'refused' && e.reason === 'not_https') || (e.status === 'failed' && retryFailed)
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
    if (freeBytes() < minFreeBytes) {
      console.log(`stopping: less than ${minFreeBytes / 1024 ** 3} GiB free on the disk holding ${cache}. The ledger is saved; free some space (or move the cache) and run again.`)
      break
    }
    const r = await dl.download(upgrade.has(a.sourceUrl) ? a.sourceUrl.replace(/^http:/, 'https:') : a.sourceUrl, a.kind) // the ledger keeps the original address
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
  // In development Payload pushes schema changes to whatever database it is pointed at. Against a hosted database that
  // would rewrite its schema outside the migration ledger, so a hosted save must run in production mode.
  if (!local && process.env.NODE_ENV !== 'production') throw new Error('Refusing to save into a hosted database without NODE_ENV=production (development mode would push schema changes to it).')
  if (!local && !has('allow-remote')) throw new Error(`Refusing to save into ${dbHost}: it is not on this machine. Pass --allow-remote if the owner has approved this target.`)

  // Before anything connects: a hosted save with incomplete storage settings would write records whose files go nowhere.
  if (!local && !dryRun) {
    const early = (await import('../../src/lib/assets/storage-verify')).describeStorageTarget(process.env as Record<string, string | undefined>)
    if (!early.configured) throw new Error(`Refusing to save into a hosted database: files would not reach cloud storage (${early.problems.join('; ')}).`)
  }

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
  // Every Payload call gets its OWN copy of this (`context: { ...ctx }`), never the object itself. The storage plugin keeps state on
  // a call's context (the file it is uploading, a "skip the upload" flag for its own follow-up write) and does not always clean it
  // up. One shared object therefore carried that state into the next call, and from the first upload on, files were saved to the
  // database and silently never sent to the bucket. Do not pass `ctx` directly.
  const ctx = { disableRevalidate: true }

  // ---- storage: prove that files land in the bucket the site reads from -------------------------------------------------------
  // The CMS happily stores a record whose file never arrived (storage not switched on in this process, a wrong bucket, a write
  // that failed quietly). So: refuse to save into a hosted database unless storage is configured AND active in this process;
  // write and read back one probe object before anything is saved; and after every file is saved, ask the bucket for it.
  const { STORAGE_PREFIXES } = await import('../../src/plugins/storage')
  const { describeStorageTarget, expectedKeys, missingKeys } = await import('../../src/lib/assets/storage-verify')
  const target = describeStorageTarget(process.env as Record<string, string | undefined>)
  const mediaUpload = payload.config.collections.find((c) => c.slug === 'media')?.upload
  // The storage plugin sets this on every collection it takes over; it is how to tell, from inside the process, that it is on.
  const storagePluginActive = typeof mediaUpload === 'object' && mediaUpload.disableLocalStorage === true
  if (!local && !(target.configured && storagePluginActive)) {
    throw new Error(
      `Refusing to save into a hosted database: files would not reach cloud storage. ${target.problems.join('; ') || 'The S3 settings are present, but the storage plugin is not active in this process'}${target.configured && !storagePluginActive ? ' (the storage plugin is off: is S3_BUCKET set in the environment this command runs in?)' : ''}.`,
    )
  }
  if (local && target.bucket && !storagePluginActive) throw new Error('S3_BUCKET is set but the storage plugin is not active in this process; refusing to guess where files would go.')

  const { openStorage } = await import('./storage-client')
  const storage = storagePluginActive ? await openStorage() : null
  let headKey: (key: string) => Promise<boolean> = async () => true
  if (storage) {
    headKey = storage.head
    // Write, read back and remove one small object. A bad key, a wrong bucket or a read-only key fails here, before any record is made.
    await storage.selfTest()
    console.log(`storage: bucket "${storage.target.bucket}" at ${storage.target.endpointHost ?? 'the default S3 endpoint'}: self-test passed (write, read back, delete)`)
  } else {
    console.log('storage: local disk (no S3 settings): files are written under public/media and are not checked against a bucket')
  }
  let verifiedFiles = 0
  let repairedFiles = 0
  /** The objects a saved record needs that are not in the bucket (empty when all are there, or when storage is local disk). */
  const notInStorage = async (collection: 'media' | 'audio' | 'video', doc: unknown): Promise<string[]> => {
    if (!storage) return []
    const keys = expectedKeys(doc as never, STORAGE_PREFIXES[collection])
    if (keys.length === 0) return ['(the record has no file name)']
    const gone = await missingKeys(keys, headKey)
    if (gone.length === 0) verifiedFiles++
    return gone
  }

  const find = async (collection: 'media' | 'audio' | 'video' | 'posts' | 'pages' | 'productions' | 'sections' | 'categories' | 'contributors' | 'events' | 'event-categories', where: Record<string, unknown>) =>
    (await payload.find({ collection, where: where as never, limit: 1, depth: 0, overrideAccess: true })).docs[0]

  const cachedFile = (a: AssetRef) => {
    const e = ledger.get(a.sourceUrl)
    if (e?.status !== 'ok') throw new Error(`no downloaded file for ${a.sourceUrl}`)
    const data = fs.readFileSync(path.join(cache, 'files', e.sha256))
    const mimetype = mimeFor(a.kind, e.contentType, a.sourceUrl)
    if (!mimetype) throw new Error(`cannot tell what kind of file ${a.sourceUrl} is (${e.contentType})`)
    const name = decodeURIComponent(new URL(a.sourceUrl).pathname.split('/').pop() || `${a.kind}-${e.sha256.slice(0, 8)}`)
    return { file: { data, mimetype, name, size: data.length }, name }
  }

  const libraryId = async (a: AssetRef): Promise<number | string> => {
    const collection = a.kind === 'image' ? 'media' : a.kind
    const existing = await find(collection, { 'legacy.sourceUrl': { equals: a.sourceUrl } })
    if (existing) {
      // A record is only reusable if its file is in storage. One left by an earlier run whose upload never happened is repaired
      // from the downloaded copy, and checked again; if that does not work either, this is a failure, never a silent reuse.
      const gone = await notInStorage(collection, existing)
      if (gone.length === 0) return existing.id
      const { file } = cachedFile(a)
      // `overwriteExistingFiles`: put the file back under its own name (otherwise Payload renames it, as the name is taken by this record).
      const fixed = await payload.update({ collection, id: existing.id, overrideAccess: true, overwriteExistingFiles: true, context: { ...ctx }, file, data: {} as never })
      const still = await notInStorage(collection, fixed)
      if (still.length) throw new Error(`${a.sourceUrl}: the record exists but its file is not in storage even after re-uploading (${still.slice(0, 3).join(', ')})`)
      repairedFiles++
      return existing.id
    }
    const { file, name } = cachedFile(a)
    const legacy = { sourceUrl: a.sourceUrl }
    const doc =
      a.kind === 'image'
        ? await payload.create({ collection: 'media', overrideAccess: true, context: { ...ctx }, file, data: { alt: a.alt ?? '', ...(a.credit ? { credit: a.credit } : {}), ...(a.source ? { source: a.source } : {}), legacy } as never })
        : a.kind === 'audio'
          ? await payload.create({ collection: 'audio', overrideAccess: true, context: { ...ctx }, file, data: { title: a.title ?? name, ...(a.description ? { description: a.description } : {}), ...(a.credit ? { credit: a.credit } : {}), ...(a.durationSeconds ? { durationSeconds: a.durationSeconds } : {}), legacy } as never })
          : await payload.create({ collection: 'video', overrideAccess: true, context: { ...ctx }, file, data: { title: a.title ?? name, ...(a.description ? { description: a.description } : {}), ...(a.credit ? { credit: a.credit } : {}), legacy } as never })
    const gone = await notInStorage(collection, doc)
    if (gone.length) {
      // Do not leave a record that points at nothing: remove it, so a re-run starts clean, and say exactly what is missing.
      await payload.delete({ collection, id: doc.id, overrideAccess: true, context: { ...ctx } }).catch(() => undefined)
      throw new Error(`${a.sourceUrl}: saved, but the file did not reach storage (missing ${gone.slice(0, 3).join(', ')}${gone.length > 3 ? ', ...' : ''}); the record was removed`)
    }
    return doc.id
  }

  const findOrCreate = async (collection: 'sections' | 'categories' | 'contributors', field: string, value: string, data: Record<string, unknown>) => {
    const found = await find(collection, { [field]: { equals: value } })
    return found ? found.id : (await payload.create({ collection, data: data as never, overrideAccess: true, context: { ...ctx } })).id
  }

  let saved = 0
  let already = 0
  const failures: { path: string; error: string }[] = []

  // Shows first, so an episode can point at its show. A show is a production at Grove's exact address.
  const productionByPath = new Map<string, number | string>()
  for (const sh of shows) {
    const bad = sh.assets.filter((a) => ledger.get(a.sourceUrl)?.status !== 'ok')
    if (bad.length) {
      held.push({ path: sh.path, why: `${bad.length} file(s) not fetched` })
      continue
    }
    try {
      const existing = await find('productions', { path: { equals: sh.path } })
      if (existing) {
        productionByPath.set(sh.path, existing.id)
        continue
      }
      const ids = new Map<string, number | string>()
      for (const a of sh.assets) ids.set(a.sourceUrl, await libraryId(a))
      const r = resolveAssets({ heroImage: sh.heroImage, description: sh.description }, ids)
      const doc = await payload.create({
        collection: 'productions',
        overrideAccess: true,
        context: { ...ctx },
        data: { title: sh.title, slug: sh.slug, path: sh.path, ...(sh.schedule ? { schedule: sh.schedule } : {}), ...(r.heroImage ? { heroImage: r.heroImage } : {}), ...(r.description ? { description: r.description } : {}), listed: true, legacy: sh.legacy } as never,
      })
      productionByPath.set(sh.path, doc.id)
      noteCounts.set('import.show-saved', (noteCounts.get('import.show-saved') ?? 0) + 1)
    } catch (e) {
      failures.push({ path: sh.path, error: why(e) })
      console.log(`FAILED show ${sh.path}: ${why(e).slice(0, 300)}`)
    }
  }
  /** The show an episode belongs to: the one imported from its own page, else a minimal one made from the episode, and said so. */
  const productionFor = async (show: { path: string; title: string | null }): Promise<number | string> => {
    const known = productionByPath.get(show.path) ?? (await find('productions', { path: { equals: show.path } }))?.id
    if (known !== undefined) {
      productionByPath.set(show.path, known)
      return known
    }
    const slug = show.path.split('/').filter(Boolean).pop() ?? 'show'
    const doc = await payload.create({ collection: 'productions', overrideAccess: true, context: { ...ctx }, data: { title: show.title ?? slug.replace(/-/g, ' '), slug, path: show.path, listed: false } as never })
    productionByPath.set(show.path, doc.id)
    noteCounts.set('import.show-made-from-episode', (noteCounts.get('import.show-made-from-episode') ?? 0) + 1)
    return doc.id
  }

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

      const production = s.show ? await productionFor(s.show) : undefined
      const section = plan.section ? await findOrCreate('sections', 'slug', plan.section.slug, { title: plan.section.title, slug: plan.section.slug }) : undefined
      const categories: (number | string)[] = []
      for (const t of s.topics) categories.push(await findOrCreate('categories', 'title', t.title, { title: t.title, ...(t.slug ? { slug: t.slug } : {}) }))
      const contributors: (number | string)[] = []
      for (const p of resolved.people) {
        contributors.push(await findOrCreate('contributors', 'name', p.name, { name: p.name, ...(p.slug ? { slug: p.slug } : {}), ...(p.title ? { title: p.title } : {}), ...(p.bio ? { bio: p.bio } : {}), ...(p.photo ? { photo: p.photo } : {}) }))
      }

      await payload.create({
        collection: 'posts',
        overrideAccess: true,
        context: { ...ctx },
        data: {
          title: s.title,
          slug: s.slug,
          path: s.path,
          publishedAt: s.publishedAt,
          source: s.source,
          ...(section ? { section } : {}),
          ...(production !== undefined ? { production } : {}),
          format: s.format,
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
      failures.push({ path: s.path, error: why(e) })
      console.log(`FAILED ${s.path}: ${why(e).slice(0, 300)}`)
    }
  }
  // Standard pages: a title and a body at Grove's exact address. Same rules: all files downloaded, matched on the Grove id.
  let pagesSaved = 0
  for (const pg of standardPages) {
    if (pagesSaved >= limit) break
    const bad = pg.assets.filter((a) => ledger.get(a.sourceUrl)?.status !== 'ok')
    if (bad.length) {
      held.push({ path: pg.path, why: `${bad.length} file(s) not fetched: ${bad.slice(0, 2).map((a) => a.sourceUrl).join('; ')}` })
      continue
    }
    try {
      if (await find('pages', { 'legacy.groveId': { equals: pg.legacy.groveId } })) {
        already++
        continue
      }
      const ids = new Map<string, number | string>()
      for (const a of pg.assets) ids.set(a.sourceUrl, await libraryId(a))
      const resolved = resolveAssets({ body: pg.body }, ids)
      await payload.create({
        collection: 'pages',
        overrideAccess: true,
        context: { ...ctx },
        data: { title: pg.title, slug: pg.slug, path: pg.path, template: 'standard', ...(pg.summary ? { summary: pg.summary } : {}), body: resolved.body, legacy: { legacyPath: pg.legacy.legacyPath, groveId: pg.legacy.groveId, modifiedAt: pg.legacy.modifiedAt }, _status: 'published' } as never,
      })
      pagesSaved++
    } catch (e) {
      failures.push({ path: pg.path, error: why(e) })
      console.log(`FAILED ${pg.path}: ${why(e).slice(0, 300)}`)
    }
  }
  if (pagesSaved) console.log(`save: ${pagesSaved} standard pages`)

  // Author profiles. A person usually exists already (created from a byline, matched on the slug); their profile fields are added
  // to that record, never a second one. Matched on the Grove id first, so a re-run changes nothing.
  let authorsSaved = 0
  for (const au of authors) {
    if (authorsSaved >= limit) break
    const bad = au.assets.filter((a) => ledger.get(a.sourceUrl)?.status !== 'ok')
    if (bad.length) {
      held.push({ path: au.path, why: `${bad.length} file(s) not fetched: ${bad.slice(0, 2).map((a) => a.sourceUrl).join('; ')}` })
      continue
    }
    try {
      if (await find('contributors', { 'legacy.groveId': { equals: au.legacy.groveId } })) {
        already++
        continue
      }
      const ids = new Map<string, number | string>()
      for (const a of au.assets) ids.set(a.sourceUrl, await libraryId(a))
      const resolved = resolveAssets({ biography: au.biography, portrait: au.portrait }, ids)
      const fields = {
        name: au.name,
        slug: au.slug,
        ...(au.summary ? { bio: au.summary } : {}),
        ...(resolved.biography ? { biography: resolved.biography } : {}),
        ...(resolved.portrait ? { photo: resolved.portrait } : {}),
        ...(au.links.length ? { links: au.links } : {}),
        legacy: { legacyPath: au.legacy.legacyPath, groveId: au.legacy.groveId },
      }
      const byline = await find('contributors', { slug: { equals: au.slug } })
      if (byline) {
        // Keep what a byline already gave (a title, a photo); fill what it did not.
        const have = byline as unknown as { photo?: unknown; bio?: string | null; title?: string | null }
        const { photo, bio, ...rest } = fields as typeof fields & { photo?: unknown; bio?: string }
        await payload.update({ collection: 'contributors', id: byline.id, overrideAccess: true, context: { ...ctx }, data: { ...rest, ...(have.photo ? {} : photo ? { photo } : {}), ...(have.bio ? {} : bio ? { bio } : {}) } as never })
      } else await payload.create({ collection: 'contributors', overrideAccess: true, context: { ...ctx }, data: fields as never })
      authorsSaved++
    } catch (e) {
      failures.push({ path: au.path, error: why(e) })
      console.log(`FAILED ${au.path}: ${why(e).slice(0, 300)}`)
    }
  }
  if (authorsSaved) console.log(`save: ${authorsSaved} author profiles`)

  // Community-calendar events at Grove's exact addresses. Same rules: every file downloaded, matched on the Grove id. An event
  // whose date text could not be read is saved WITH its original wording, flagged `needsAttention`, and no dates; it is never dropped.
  let eventsSaved = 0
  for (const ev of events) {
    if (eventsSaved >= limit) break
    const bad = ev.assets.filter((a) => ledger.get(a.sourceUrl)?.status !== 'ok')
    if (bad.length) {
      held.push({ path: ev.path, why: `${bad.length} file(s) not fetched: ${bad.slice(0, 2).map((a) => a.sourceUrl).join('; ')}` })
      continue
    }
    try {
      if (await find('events', { 'legacy.groveId': { equals: ev.legacy.groveId } })) {
        already++
        continue
      }
      const ids = new Map<string, number | string>()
      for (const a of ev.assets) ids.set(a.sourceUrl, await libraryId(a))
      const resolved = resolveAssets({ image: ev.image, description: ev.description }, ids)
      const categories: (number | string)[] = []
      for (const c of ev.categories) {
        const known = (await find('event-categories', { 'legacy.groveId': { equals: c.groveId } })) ?? (await find('event-categories', { title: { equals: c.title } }))
        categories.push(known ? known.id : (await payload.create({ collection: 'event-categories', overrideAccess: true, context: { ...ctx }, data: { title: c.title, legacy: { groveId: c.groveId } } as never })).id)
      }
      await payload.create({
        collection: 'events',
        overrideAccess: true,
        context: { ...ctx },
        data: {
          title: ev.title,
          ...(ev.teaser ? { teaser: ev.teaser } : {}),
          ...(resolved.description ? { description: resolved.description } : {}),
          categories,
          schedule: ev.schedule,
          venue: ev.venue,
          organization: ev.organization,
          price: ev.price,
          free: ev.free,
          ticketUrl: ev.ticketUrl,
          ...(resolved.image ? { image: resolved.image } : {}),
          path: ev.path,
          legacy: ev.legacy,
          _status: 'published',
        } as never,
      })
      eventsSaved++
      if (ev.legacy.needsAttention) noteCounts.set('import.event-needs-attention', (noteCounts.get('import.event-needs-attention') ?? 0) + 1)
    } catch (e) {
      failures.push({ path: ev.path, error: why(e) })
      console.log(`FAILED ${ev.path}: ${why(e).slice(0, 300)}`)
    }
  }
  if (eventsSaved) console.log(`save: ${eventsSaved} events`)
  if (storage) console.log(`storage: ${verifiedFiles} file record(s) checked in the bucket, ${repairedFiles} repaired by re-uploading`)
  summary(saved + pagesSaved + eventsSaved, already, noteCounts, failures)
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
    authorsSkippedByRule: authorsSkipped.length,
    failures,
  }
  const file = path.join(cache, 'import-report.json')
  fs.writeFileSync(file, JSON.stringify(out, null, 1))
  console.log(JSON.stringify({ ...out, heldStories: `${held.length} (see ${file})` }, null, 1))
}

if (phase === 'fetch' || phase === 'all') await fetchPhase()
if (phase === 'save' || phase === 'all') await savePhase()
if (phase === 'fetch') process.exit(0)
