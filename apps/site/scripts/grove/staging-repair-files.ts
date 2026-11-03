// STAGING ONLY. Finds library records (pictures, audio, video) the Grove importer created whose files are not in the bucket,
// and puts the files back from the importer's own download cache, so the stories that use them are whole again. Nothing is
// deleted: the records, and every story's link to them, stay exactly as they are; only the missing files are uploaded.
//
//   pnpm exec tsx scripts/grove/staging-repair-files.ts --cache <dir>                   # DRY RUN (default): reports, writes nothing
//   pnpm exec tsx scripts/grove/staging-repair-files.ts --cache <dir> --apply           # re-upload the missing files
//
//   --cache   the importer's cache folder (it holds assets.jsonl and files/); the only place the original bytes are.
//   --apply   without it nothing in the database or the bucket is changed.
//   --local-rehearsal   lets the script run against a scratch database on this machine (for testing the script itself).
//
// Safety, in this order: it refuses unless NODE_ENV=production (a hosted run must not push schema changes); refuses unless
// DATABASE_URL is provably the STAGING project (an allow-list of one: see src/lib/assets/staging-guard.ts); refuses unless the
// bucket settings are complete, because without them it cannot tell what is missing. Only records with a Grove `legacy.sourceUrl`
// are looked at (editors' uploads are never touched). It never prints a password or a key.

import fs from 'node:fs'
import path from 'node:path'

import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

const args = process.argv.slice(2)
const flag = (n: string) => args.flatMap((a, i) => (a === `--${n}` ? [args[i + 1] ?? ''] : []))
const has = (n: string) => args.includes(`--${n}`)
const apply = has('apply')
const cache = flag('cache')[0]
if (!cache) throw new Error('Pass --cache <dir>: the importer cache that holds assets.jsonl and files/.')

const { checkStagingDatabase } = await import('../../src/lib/assets/staging-guard')
const { STORAGE_PREFIXES } = await import('../../src/plugins/storage')
const { expectedKeys, missingKeys } = await import('../../src/lib/assets/storage-verify')
const { mimeFor } = await import('../../src/lib/assets/download')
const { openStorage } = await import('./storage-client')

const guard = checkStagingDatabase(process.env.DATABASE_URL, { allowLocal: has('local-rehearsal') })
if (!guard.ok) throw new Error(`Refusing to run: ${guard.reason}`)
if (guard.where === 'staging' && process.env.NODE_ENV !== 'production') throw new Error('Refusing to run against a hosted database without NODE_ENV=production (development mode would push schema changes to it).')

const storage = await openStorage()
if (!storage) throw new Error('Refusing to run: the bucket settings are incomplete, so there is no way to tell which files are missing. Set S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.')
await storage.selfTest()
console.log(`database: ${guard.where}${apply ? '' : '   (DRY RUN: nothing will be changed; add --apply to repair)'}`)
console.log(`storage:  bucket "${storage.target.bucket}" at ${storage.target.endpointHost ?? 'the default S3 endpoint'}: self-test passed`)

// The importer's ledger: one JSON line per attempt, the last line for an address wins.
type Entry = { sourceUrl: string; status: string; sha256?: string; contentType?: string }
const ledger = new Map<string, Entry>()
const ledgerFile = path.join(cache, 'assets.jsonl')
if (!fs.existsSync(ledgerFile)) throw new Error(`No ledger at ${ledgerFile}. Is --cache the importer's cache folder?`)
for (const line of fs.readFileSync(ledgerFile, 'utf8').split('\n')) if (line.trim()) ledger.set((JSON.parse(line) as Entry).sourceUrl, JSON.parse(line) as Entry)

const { getPayload } = await import('payload')
const config = (await import('../../src/payload.config')).default
const payload = await getPayload({ config })

const KINDS = { media: 'image', audio: 'audio', video: 'video' } as const
type Collection = keyof typeof KINDS

interface Broken { collection: Collection; id: string | number; filename: string; sourceUrl: string; missing: string[] }
const broken: Broken[] = []
const totals: Record<string, { records: number; broken: number }> = {}

for (const collection of Object.keys(KINDS) as Collection[]) {
  totals[collection] = { records: 0, broken: 0 }
  for (let page = 1; ; page++) {
    const r = await payload.find({ collection, where: { 'legacy.sourceUrl': { exists: true } }, depth: 0, limit: 100, page, sort: 'id', overrideAccess: true })
    for (const doc of r.docs as unknown as { id: string | number; filename?: string; legacy?: { sourceUrl?: string } }[]) {
      totals[collection]!.records++
      const keys = expectedKeys(doc as never, STORAGE_PREFIXES[collection])
      const missing = keys.length === 0 ? ['(the record has no file name)'] : await missingKeys(keys, storage.head)
      if (missing.length) {
        totals[collection]!.broken++
        broken.push({ collection, id: doc.id, filename: doc.filename ?? '(none)', sourceUrl: doc.legacy?.sourceUrl ?? '', missing })
      }
    }
    if (!r.hasNextPage) break
  }
}

const repairable = broken.filter((b) => ledger.get(b.sourceUrl)?.status === 'ok' && fs.existsSync(path.join(cache, 'files', ledger.get(b.sourceUrl)!.sha256 ?? '-')))
const notRepairable = broken.filter((b) => !repairable.includes(b))

console.log('\nimporter-created library records:')
for (const [c, t] of Object.entries(totals)) console.log(`  ${c.padEnd(6)} ${String(t.records).padStart(5)} records, ${String(t.broken).padStart(5)} with files missing from the bucket`)
console.log(`\nmissing and repairable from the cache: ${repairable.length}`)
console.log(`missing and NOT repairable (no downloaded copy in the cache):  ${notRepairable.length}`)
for (const b of broken.slice(0, 15)) console.log(`  ${b.collection}/${b.id}  ${b.filename}  missing ${b.missing.length} object(s)${repairable.includes(b) ? '' : '  (no cached copy)'}`)
if (broken.length > 15) console.log(`  ... and ${broken.length - 15} more`)

if (!apply) {
  console.log('\nDRY RUN: nothing was changed. To repair, run again with --apply.')
  process.exit(notRepairable.length ? 2 : 0)
}

let repaired = 0
const failures: { id: string | number; collection: string; error: string }[] = []
for (const b of repairable) {
  try {
    const e = ledger.get(b.sourceUrl)!
    const data = fs.readFileSync(path.join(cache, 'files', e.sha256!))
    const mimetype = mimeFor(KINDS[b.collection], e.contentType ?? '', b.sourceUrl)
    if (!mimetype) throw new Error(`cannot tell what kind of file this is (${e.contentType})`)
    // A fresh context for every call: the storage plugin leaves state on a context object that must not be reused.
    // `overwriteExistingFiles`: put the file back under its OWN name. Without it Payload sees the name is taken (by this very record) and picks a new one.
    const fixed = await payload.update({ collection: b.collection, id: b.id, overrideAccess: true, overwriteExistingFiles: true, context: { disableRevalidate: true }, file: { data, mimetype, name: b.filename, size: data.length }, data: {} as never })
    const still = await missingKeys(expectedKeys(fixed as never, STORAGE_PREFIXES[b.collection]), storage.head)
    if (still.length) throw new Error(`still missing after re-uploading: ${still.slice(0, 3).join(', ')}`)
    repaired++
  } catch (err) {
    failures.push({ id: b.id, collection: b.collection, error: (err as Error).message.slice(0, 200) })
  }
}
console.log(`\nrepaired ${repaired} of ${repairable.length}; ${failures.length} failed; ${notRepairable.length} had no cached copy.`)
for (const f of failures.slice(0, 20)) console.log(`  FAILED ${f.collection}/${f.id}: ${f.error}`)
process.exit(failures.length || notRepairable.length ? 1 : 0)
