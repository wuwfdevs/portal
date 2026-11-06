// Moves every show and its episodes from Grove's two show addresses to one pattern (owner decision, 2026-11-04):
//
//   /show/<slug>                     -> /shows/<slug>
//   /podcast/<slug>                  -> /shows/<slug>
//   /show/<slug>/<date>/<episode>    -> /shows/<slug>/<date>/<episode>     (and the same under /podcast)
//
// each old address leaving a permanent redirect. Run it once the import is in, on staging first, then on production.
//
//   pnpm exec tsx scripts/shows/consolidate.ts                        # DRY RUN (default): lists every move, writes nothing
//   pnpm exec tsx scripts/shows/consolidate.ts --only ecominutes      # one show first
//   pnpm exec tsx scripts/shows/consolidate.ts --apply                # move them
//   pnpm exec tsx scripts/shows/consolidate.ts --apply --production   # the same on production (staging first)
//
//   --apply             without it nothing in the database is changed
//   --only              only shows whose current address contains this text
//   --production        allow the production project (refused without it)
//   --report            also write every row as JSON to this file (outside the repository)
//   --local-rehearsal   lets it run against a scratch database on this machine (for testing the script itself)
//
// What it changes: the `path` of shows and of the stories that belong to them, and the redirects collection (one redirect per moved
// address, written by the address hooks). Nothing else. It skips, and says so: two shows that would land on the same address, an
// address another record already has, and an episode that is not under its show's address (left where it is). It is safe to run
// again: what has moved is recognised, and a show whose episodes did not all move stays put until they do.
//
// Not changed, on purpose: podcast feeds stay at `/podcast/<slug>/rss.xml` (apps subscribe to that address; the feed route finds the
// show by its name, not its address), and every record's Grove path (`legacy.legacyPath`) stays as provenance.
//
// Safety: it refuses any database that is not the site's staging or (with --production) production project; it refuses a hosted database
// without NODE_ENV=production (development mode would push schema changes to it); it never prints a password. Pages in the site's cache
// refresh through the site's own revalidation, which this script cannot run: after `--apply`, redeploy (or revalidate) the site.

import fs from 'node:fs'
import path from 'node:path'

import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

const args = process.argv.slice(2)
const flag = (n: string) => args.flatMap((a, i) => (a === `--${n}` ? [args[i + 1] ?? ''] : []))
const has = (n: string) => args.includes(`--${n}`)
const apply = has('apply')

const { checkSiteDatabase } = await import('../../src/lib/assets/staging-guard')
const { assertOutsideRepo } = await import('../../src/lib/census/state-io')
const { consolidateShows, summarizeMoves } = await import('./consolidate-core')

const guard = checkSiteDatabase(process.env.DATABASE_URL, { allowLocal: has('local-rehearsal'), allowProduction: has('production') })
if (!guard.ok) throw new Error(`Refusing to run: ${guard.reason}`)
if (guard.where !== 'this machine' && process.env.NODE_ENV !== 'production') throw new Error('Refusing to run against a hosted database without NODE_ENV=production (development mode would push schema changes to it).')
const reportFile = flag('report')[0]
if (reportFile) assertOutsideRepo(path.resolve(path.dirname(reportFile)))
console.log(`database: ${guard.where}${apply ? '' : '   (DRY RUN: nothing will be changed; add --apply to move)'}`)

const { getPayload } = await import('payload')
const config = (await import('../../src/payload.config')).default
const payload = await getPayload({ config })

const only = flag('only')[0]
const rows = await consolidateShows(payload, { apply, ...(only ? { only } : {}), log: (l) => console.log(l) })

console.log('\nsummary:')
for (const [k, n] of Object.entries(summarizeMoves(rows)).sort()) console.log(`  ${k.padEnd(26)} ${n}`)
if (reportFile) {
  fs.writeFileSync(reportFile, JSON.stringify(rows, null, 2))
  console.log(`report: ${reportFile}`)
}
if (apply) console.log('\nDone. Redeploy or revalidate the site so cached pages at the old addresses are replaced by their redirects.')
process.exit(rows.some((r) => r.verdict === 'failed') ? 1 : 0)
