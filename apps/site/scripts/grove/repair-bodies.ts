// STAGING ONLY. Repairs the BODY of stories the Grove importer already saved, using what the converter makes of their Grove pages
// today: a "RELATED:" or "Support Local Stories." line becomes a link-line block, and markup typed as words (`<i>Frontiers in
// Psychology</i>` shown on the page) becomes the formatting it asked for. The importer leaves a story that is already in alone,
// so re-running it cannot do this.
//
//   pnpm exec tsx scripts/grove/repair-bodies.ts --raw <dir> [--raw <dir>...]                  # DRY RUN (default): reports, writes nothing
//   pnpm exec tsx scripts/grove/repair-bodies.ts --raw <dir> [--raw <dir>...] --apply          # replace the bodies listed as "would-repair"
//
//   --raw       the unzipped census pages (outside the repository), the same folders the importer was given
//   --apply     without it nothing in the database is changed
//   --only      only stories whose path contains this text (try one story first)
//   --limit     stop after this many stories are repaired (or would be)
//   --report    also write every row as JSON to this file (outside the repository)
//   --local-rehearsal   lets the script run against a scratch database on this machine (for testing the script itself)
//
// What it changes: only a story's body (`content`). Never a title, path, date, author, picture or any other field, and it never
// creates, fetches or uploads a file. What it skips, and says so: a story an editor has changed since the import (the version
// history has more than the one version the importer saved), a story whose body would read differently, a story whose pictures or
// audio are not all already in the library, and a story with no Grove page among the pages given.
//
// Safety, in this order: it refuses unless NODE_ENV=production for a hosted database (development mode would push schema changes
// to it); refuses unless DATABASE_URL is provably the STAGING project (an allow-list of one: see src/lib/assets/staging-guard.ts).
// It never prints a password or a key. Pages in the site's cache refresh through the site's own revalidation (this script cannot
// run it): after `--apply`, redeploy or revalidate staging.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

const args = process.argv.slice(2)
const flag = (n: string) => args.flatMap((a, i) => (a === `--${n}` ? [args[i + 1] ?? ''] : []))
const has = (n: string) => args.includes(`--${n}`)
const apply = has('apply')
const raw = flag('raw')
if (!raw.length) throw new Error('Pass --raw <dir>: the unzipped census pages, the same folders the importer was given.')

const { checkStagingDatabase } = await import('../../src/lib/assets/staging-guard')
const { assertOutsideRepo } = await import('../../src/lib/census/state-io')
const { convertStory } = await import('../../src/lib/grove')
const { repairBodies, summarizeRepair } = await import('./repair-bodies-core')

const guard = checkStagingDatabase(process.env.DATABASE_URL, { allowLocal: has('local-rehearsal') })
if (!guard.ok) throw new Error(`Refusing to run: ${guard.reason}`)
if (guard.where === 'staging' && process.env.NODE_ENV !== 'production') throw new Error('Refusing to run against a hosted database without NODE_ENV=production (development mode would push schema changes to it).')
const reportFile = flag('report')[0]
if (reportFile) assertOutsideRepo(path.resolve(path.dirname(reportFile)))
console.log(`database: ${guard.where}${apply ? '' : '   (DRY RUN: nothing will be changed; add --apply to repair)'}`)

// The pages: converted exactly as the importer converted them (same options), so the bodies are what a fresh import would make.
const files: string[] = []
const collect = (d: string) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) collect(p)
    else if (e.name.endsWith('.json.gz')) files.push(p)
  }
}
raw.forEach(collect)
files.sort()
const stories = []
for (const f of files) {
  const r = convertStory(JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8')), { embedHosts: [] })
  if (r.status === 'converted' && r.report.status !== 'exception') stories.push(r.story)
}
console.log(`pages: ${files.length} read, ${stories.length} convert as stories`)

const { getPayload } = await import('payload')
const config = (await import('../../src/payload.config')).default
const payload = await getPayload({ config })

const only = flag('only')[0]
const limit = flag('limit')[0] ? Number(flag('limit')[0]) : undefined
const rows = await repairBodies(payload, stories, { apply, ...(only ? { only } : {}), ...(limit ? { limit } : {}), log: (l) => console.log(l) })

const interesting = rows.filter((r) => r.verdict !== 'unchanged')
for (const r of interesting) {
  const what = [r.linkLinesAdded ? `${r.linkLinesAdded} link line(s)` : '', r.typedMarkupPieces ? `${r.typedMarkupPieces} typed-markup piece(s)` : ''].filter(Boolean).join(', ')
  console.log(`${r.verdict.padEnd(22)} ${r.path}${what ? `   [${what}]` : ''}${r.detail ? `   (${r.detail})` : ''}`)
}
console.log('\nsummary:', JSON.stringify(summarizeRepair(rows)))
if (reportFile) {
  fs.writeFileSync(reportFile, JSON.stringify({ at: new Date().toISOString(), apply, database: guard.where, rows }, null, 2))
  console.log(`report written to ${reportFile}`)
}
if (!apply) console.log('\nDRY RUN: nothing was changed. Review the "would-repair" lines, then run again with --apply.')
else if (rows.some((r) => r.verdict === 'repaired')) console.log('\nRepaired bodies show on the site once its pages are revalidated: redeploy or revalidate staging.')
process.exit(rows.some((r) => r.verdict === 'failed') ? 1 : 0)
