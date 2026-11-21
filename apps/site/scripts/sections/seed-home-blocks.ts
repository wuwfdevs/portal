// The home page built from blocks, beside the coded home page (PAGE-BLOCKS.md → Home): a page in the home set at /home-blocks, written from the Home page global as it is
// today, so the two can be compared and the blocks adjusted until they match.
//
//   pnpm seed:home-blocks                                   dry run: says what it would write, and what the blocks do not carry over; writes nothing
//   pnpm seed:home-blocks --go                              writes the page as a DRAFT (staging only)
//   pnpm seed:home-blocks --go --publish                    also publishes it at /home-blocks, noindex (the owner decides)
//   pnpm seed:home-blocks --local-rehearsal --go [--publish]   the same on a database on this machine
//
// Rules (the same as `seed-sample-page.ts`): it refuses any database that is not staging (production included), writes one page and reads everything else, is safe to run
// twice (the page is found by its address name and replaced whole), and sends nothing. It never changes the Home page global or the coded home page.

import dotenv from 'dotenv'
import type { Payload } from 'payload'

import { checkStagingDatabase } from '../../src/lib/assets/staging-guard'
import { HOME_BLOCKS_PAGE, homepageToSections, type HomepageFields } from '../../src/lib/homepage/to-sections'

dotenv.config({ path: '.env.local' })
dotenv.config()

const args = process.argv.slice(2)
const go = args.includes('--go')
const publish = args.includes('--publish')
const local = args.includes('--local-rehearsal')

const guard = checkStagingDatabase(process.env.DATABASE_URL, { allowLocal: local })
if (!guard.ok) throw new Error(`Refusing to write the home page of blocks: ${guard.reason}`)
console.log(`${go ? 'WRITING to' : 'Dry run against'} ${guard.where}.`)

const { getPayload } = await import('payload')
const { default: config } = await import('@payload-config')
const payload: Payload = await getPayload({ config })
const ctx = { disableRevalidate: true, disableEmbedding: true }

const settings = (await payload.findGlobal({ slug: 'homepage', depth: 0, overrideAccess: true })) as unknown as HomepageFields
const { sections, notCarried } = homepageToSections(settings)
console.log(`The page: "${HOME_BLOCKS_PAGE.title}" at /${HOME_BLOCKS_PAGE.slug}, ${sections.length} sections: ${sections.map((s) => s.blockType.replace(/^section/, '')).join(', ')}.`)
console.log('Not carried over:')
for (const line of notCarried) console.log(`  - ${line}`)
if (!go) {
  console.log('Dry run: nothing written. Pass --go to write it.')
  process.exit(0)
}

const data = {
  title: HOME_BLOCKS_PAGE.title,
  slug: HOME_BLOCKS_PAGE.slug,
  template: 'sections',
  pageSet: HOME_BLOCKS_PAGE.pageSet,
  sections,
  noindex: true,
  noReferrer: true,
  meta: { title: HOME_BLOCKS_PAGE.title, description: HOME_BLOCKS_PAGE.summary },
  _status: publish ? 'published' : 'draft',
}
const existing = await payload.find({ collection: 'pages', where: { slug: { equals: HOME_BLOCKS_PAGE.slug } }, limit: 1, depth: 0, draft: true, overrideAccess: true })
const doc = existing.docs[0]
  ? await payload.update({ collection: 'pages', id: existing.docs[0].id, data: data as never, draft: !publish, overrideAccess: true, context: ctx })
  : await payload.create({ collection: 'pages', data: data as never, draft: !publish, overrideAccess: true, context: ctx })
console.log(`${existing.docs[0] ? 'Replaced' : 'Created'} page ${doc.id} (${publish ? `published at ${doc.path}` : 'draft: open it in the admin and use Live preview'}).`)
process.exit(0)
