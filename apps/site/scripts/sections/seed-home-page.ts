// The home page as a page record (PAGE-BLOCKS.md → Home): the page whose address name is `home`, in the home set, served at `/`. This writes it from the retired Home page
// global's words (`homepageToSections`) for a database that has no home page yet: a fresh staging database, or one rebuilt for a test. WUWF's staging already has its home page
// (the migration `home_page_record_site_banner` renamed the page the owner compared), and production gets its page at launch (`ROADMAP.md`, "Launch: initializing production").
//
//   pnpm seed:home                                   dry run: says what it would write, and what the blocks do not carry over; writes nothing
//   pnpm seed:home --go                              writes the page as a DRAFT (staging only)
//   pnpm seed:home --go --publish                    also publishes it at /
//   pnpm seed:home --local-rehearsal --go [--publish]   the same on a database on this machine
//   pnpm seed:home --go --replace                    replaces the sections of a home page that exists (it is the live front page: this is refused without the flag)
//
// Rules (the same as `seed-sample-page.ts`): it refuses any database that is not staging (production included), writes one page and reads everything else, never replaces an
// existing home page without `--replace`, and sends nothing. It never changes the retired global.

import dotenv from 'dotenv'
import type { Payload } from 'payload'

import { checkStagingDatabase } from '../../src/lib/assets/staging-guard'
import { HOME_PAGE, homepageToSections, type HomepageFields } from '../../src/lib/homepage/to-sections'

dotenv.config({ path: '.env.local' })
dotenv.config()

const args = process.argv.slice(2)
const go = args.includes('--go')
const publish = args.includes('--publish')
const local = args.includes('--local-rehearsal')
const replace = args.includes('--replace')

const guard = checkStagingDatabase(process.env.DATABASE_URL, { allowLocal: local })
if (!guard.ok) throw new Error(`Refusing to write the home page: ${guard.reason}`)
console.log(`${go ? 'WRITING to' : 'Dry run against'} ${guard.where}.`)

const { getPayload } = await import('payload')
const { default: config } = await import('@payload-config')
const payload: Payload = await getPayload({ config })
const ctx = { disableRevalidate: true, disableEmbedding: true }

const settings = (await payload.findGlobal({ slug: 'homepage', depth: 0, overrideAccess: true })) as unknown as HomepageFields
const { sections, notCarried } = homepageToSections(settings)
console.log(`The page: "${HOME_PAGE.title}" at /, ${sections.length} sections: ${sections.map((s) => s.blockType.replace(/^section/, '')).join(', ')}.`)
console.log('Not carried over:')
for (const line of notCarried) console.log(`  - ${line}`)
if (!go) {
  console.log('Dry run: nothing written. Pass --go to write it.')
  process.exit(0)
}

const data = {
  title: HOME_PAGE.title,
  slug: HOME_PAGE.slug,
  generateSlug: false,
  isHome: true,
  template: 'sections',
  pageSet: HOME_PAGE.pageSet,
  sections,
  meta: { title: HOME_PAGE.seoTitle, description: HOME_PAGE.summary },
  _status: publish ? 'published' : 'draft',
}
const existing = await payload.find({ collection: 'pages', where: { isHome: { equals: true } }, limit: 1, depth: 0, draft: true, overrideAccess: true })
if (existing.docs[0] && !replace) {
  console.log(`The home page already exists (page ${existing.docs[0].id}); nothing written. Pass --replace to replace its sections.`)
  process.exit(0)
}
const doc = existing.docs[0]
  ? await payload.update({ collection: 'pages', id: existing.docs[0].id, data: data as never, draft: !publish, overrideAccess: true, context: ctx })
  : await payload.create({ collection: 'pages', data: data as never, draft: !publish, overrideAccess: true, context: ctx })
console.log(`${existing.docs[0] ? 'Replaced' : 'Created'} page ${doc.id} (${publish ? 'published at /' : 'draft: open it in the admin and use Live preview'}).`)
process.exit(0)
