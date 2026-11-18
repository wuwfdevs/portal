// Seeds the STAGING database with what the home page needs to show its news sections and sponsor rail, for the preview build to run
// (`scripts/vercel-build.sh`, only on preview builds, only while `scripts/placements/SEED_ON_BUILD` exists). The same code as the commands
// beside it: the starter news sections (`lib/homepage/starter.ts`) where the home page has none, and the live rail (`import-rail-core.ts`) where
// the rail is empty. It never overwrites what an editor entered, reuses pictures it already has, refuses any database that is not staging, and
// fetches the live pictures 3 s apart with a neutral client name. Safe to run on every build; remove the marker file when it has done its job.

import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

const { checkStagingDatabase } = await import('../../src/lib/assets/staging-guard')
const guard = checkStagingDatabase(process.env.DATABASE_URL, { allowLocal: process.argv.includes('--local-rehearsal') })
if (!guard.ok) throw new Error(`Refusing to seed: ${guard.reason}`)
console.log(`seeding: ${guard.where}`)

const { getPayload } = await import('payload')
const config = (await import('../../src/payload.config')).default
const payload = await getPayload({ config })
const ctx = { disableRevalidate: true }

const { starterModules, STARTER_SECTIONS } = await import('../../src/lib/homepage/starter')
const home = await payload.findGlobal({ slug: 'homepage', depth: 0, overrideAccess: true })
const found = await payload.find({ collection: 'sections', where: { slug: { in: STARTER_SECTIONS.map((s) => s.slug) } }, limit: 10, depth: 0, pagination: false, overrideAccess: true, select: { slug: true } })
const modules = starterModules(found.docs.map((s) => ({ id: s.id, slug: s.slug })), home.newsModules)
if (modules.length > 0) {
  await payload.updateGlobal({ slug: 'homepage', data: { newsModules: modules } as never, overrideAccess: true, context: ctx })
  console.log(`news sections: added ${modules.map((m) => m.heading).join(', ')}`)
} else {
  console.log(`news sections: nothing to add (${(home.newsModules?.length ?? 0) > 0 ? 'the home page already has sections' : 'none of the starter sections exist here'})`)
}

const { fetchPicture, importRail } = await import('./import-rail-core')
const { RAIL_TILES } = await import('./rail-tiles')
const out = await importRail(payload, RAIL_TILES, { apply: true, fetchImage: fetchPicture, log: (l) => console.log(l) })
console.log(out.railWritten ? 'rail: filled' : `rail: not changed (${out.railSkippedBecause ?? 'nothing to write'})`)
process.exit(out.reports.some((r) => r.verdict === 'refused') ? 1 : 0)
