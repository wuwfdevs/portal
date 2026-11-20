// Demonstration content for the top units, story zones, site banner and home page of blocks, on the STAGING site (rules and contents: `seed-sponsor-zones-core.ts`).
//
//   pnpm exec tsx scripts/staging-demo/seed-sponsor-zones.ts                    dry run: says what it would make, writes nothing
//   pnpm exec tsx scripts/staging-demo/seed-sponsor-zones.ts --go               makes it (staging only)
//   pnpm exec tsx scripts/staging-demo/seed-sponsor-zones.ts --go --local-rehearsal   the same on a scratch database on this machine
//
// Needs the staging environment (DATABASE_URL, PAYLOAD_SECRET and the S3 variables). Refuses any database that is not staging, production included.

import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: '.env.local' })
dotenv.config()

const args = process.argv.slice(2)
const go = args.includes('--go')
const { checkStagingDatabase } = await import('../../src/lib/assets/staging-guard')
const guard = checkStagingDatabase(process.env.DATABASE_URL, { allowLocal: args.includes('--local-rehearsal') })
if (!guard.ok) throw new Error(`Refusing to seed: ${guard.reason}`)
console.log(`${go ? 'SEEDING' : 'Dry run against'} ${guard.where}.`)

const { getPayload } = await import('payload')
const config = (await import('../../src/payload.config')).default
const payload = await getPayload({ config })
const { seedSponsorZonesDemo } = await import('./seed-sponsor-zones-core')

const report = await seedSponsorZonesDemo(payload, { apply: go, assetDir: path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets'), log: (l) => console.log(l) })
console.log(`\n${report.made.length} ${go ? 'made' : 'to make'}, ${report.kept.length} already there, ${report.skipped.length} skipped.`)
process.exit(0)
