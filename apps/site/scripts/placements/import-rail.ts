// Copies the ten tiles of the live wuwf.org home page's rail into this site's media library, Sponsors and Placements (owner-approved one-time
// import, 2026-11-18). The tile list, with what each picture says and where each goes, is `rail-tiles.ts`; the rules are `import-rail-core.ts`.
//
//   pnpm exec tsx scripts/placements/import-rail.ts                        # DRY RUN (default): lists each tile, fetches and writes nothing
//   pnpm exec tsx scripts/placements/import-rail.ts --apply                # fetch the pictures (3 s apart) and fill the rail
//   pnpm exec tsx scripts/placements/import-rail.ts --apply --production   # the same on production (staging first)
//
//   --apply             without it nothing is fetched or changed
//   --replace           also clear and replace a rail made by hand (otherwise an editor's placements are never touched)
//   --production        allow the production project (refused without it)
//   --local-rehearsal   lets it run against a scratch database on this machine (for testing the script itself)
//
// Safe to run again: a picture already in the library (found by the address it came from) is reused, a placement this import made is not made
// twice, and a rail made by hand is left alone. After `--apply`, redeploy or revalidate the site (this script cannot refresh the site's cache), then have corporate support confirm
// each tile's kind, dates and artwork: the Sinfonia tile is imported held (its event has passed) and two others name dates.

import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

const args = process.argv.slice(2)
const has = (n: string) => args.includes(`--${n}`)

const { checkSiteDatabase } = await import('../../src/lib/assets/staging-guard')
const { fetchPicture, importRail } = await import('./import-rail-core')
const { RAIL_TILES } = await import('./rail-tiles')

const guard = checkSiteDatabase(process.env.DATABASE_URL, { allowLocal: has('local-rehearsal'), allowProduction: has('production') })
if (!guard.ok) throw new Error(`Refusing to run: ${guard.reason}`)
if (guard.where !== 'this machine' && process.env.NODE_ENV !== 'production') throw new Error('Refusing to run against a hosted database without NODE_ENV=production (development mode would push schema changes to it).')
const apply = has('apply')
console.log(`database: ${guard.where}${apply ? '' : '   (DRY RUN: nothing is fetched or changed; add --apply)'}\n`)

const { getPayload } = await import('payload')
const config = (await import('../../src/payload.config')).default
const payload = await getPayload({ config })

const { reports, railWritten, railSkippedBecause } = await importRail(payload, RAIL_TILES, { apply, replace: has('replace'), fetchImage: fetchPicture, log: (l) => console.log(l) })
const refused = reports.filter((r) => r.verdict === 'refused').length
console.log(`\n${reports.length} tiles: ${reports.filter((r) => r.verdict === 'imported').length} imported, ${reports.filter((r) => r.verdict === 'reused-picture').length} picture reused, ${reports.filter((r) => r.verdict === 'would-import').length} would import, ${refused} refused.`)
console.log(railWritten ? 'The rail is filled.' : railSkippedBecause ? `The rail was not changed: ${railSkippedBecause}.` : apply ? 'The rail was not changed (nothing to write).' : 'The rail is not changed in a dry run.')
if (apply) console.log('\nDone. Redeploy or revalidate the site so the home page shows the tiles.')
process.exit(refused > 0 ? 1 : 0)
