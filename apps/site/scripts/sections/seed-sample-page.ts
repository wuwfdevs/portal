// The internal sample page for the section library (PAGE-BLOCKS.md, phase 2): every block in every tone, for the owner to review at phone,
// tablet and desktop widths (the admin's Live preview has all three).
//
//   pnpm seed:sections-sample                                   dry run: says what it found and what it would write; writes nothing
//   pnpm seed:sections-sample --go                              writes the page as a DRAFT (staging only)
//   pnpm seed:sections-sample --go --publish                    also publishes it, at /internal-sections-sample, noindex (the owner decides)
//   pnpm seed:sections-sample --local-rehearsal --go [--publish] [--fixtures]
//                                                               the same on a database on this machine; --fixtures first makes a few
//                                                               records and pictures there so the data blocks have something to draw
//
// Rules this script keeps (the same as `scripts/staging-demo/seed.ts`):
//  - It refuses any database that is not staging (an allow-list of one project, `lib/assets/staging-guard.ts`), production included.
//  - It writes one page and reads everything else. It makes no media, story or show on staging; `--fixtures` is refused anywhere but a
//    database on this machine.
//  - It is safe to run twice: the page is found by its address name and replaced whole (a script sends whole documents, never a part of a draft).
//  - It sends nothing: no email, no Portal call, no embedding (`disableEmbedding`).

import dotenv from 'dotenv'
import os from 'node:os'
import path from 'node:path'
import type { Payload } from 'payload'

import { checkStagingDatabase } from '../../src/lib/assets/staging-guard'
import { SAMPLE_PAGE, buildSampleSections, type SampleRefs } from '../../src/lib/sections-sample/build'

dotenv.config({ path: '.env.local' })
dotenv.config()

const args = process.argv.slice(2)
const go = args.includes('--go')
const publish = args.includes('--publish')
const local = args.includes('--local-rehearsal')
const fixtures = args.includes('--fixtures')

const guard = checkStagingDatabase(process.env.DATABASE_URL, { allowLocal: local })
if (!guard.ok) throw new Error(`Refusing to write the sample page: ${guard.reason}`)
if (fixtures && guard.where !== 'this machine') throw new Error('--fixtures makes records and pictures, so it only runs on a database on this machine (--local-rehearsal).')
console.log(`${go ? 'WRITING to' : 'Dry run against'} ${guard.where}.`)

const { getPayload } = await import('payload')
const { default: config } = await import('@payload-config')
const payload: Payload = await getPayload({ config })
const ctx = { disableRevalidate: true, disableEmbedding: true }

type Doc = { id: number | string } & Record<string, unknown>
const idOf = (v: unknown): number | string | undefined => (typeof v === 'number' || typeof v === 'string' ? v : v && typeof v === 'object' && 'id' in v ? (v as Doc).id : undefined)

async function ensure(collection: string, where: Record<string, unknown>, data: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<Doc> {
  const found = await payload.find({ collection: collection as never, where: where as never, limit: 1, depth: 0, overrideAccess: true, draft: false })
  if (found.docs[0]) return found.docs[0] as unknown as Doc
  return (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx, ...extra })) as unknown as Doc
}

// ---------------------------------------------------------------- fixtures (a database on this machine only)
if (fixtures && go) {
  const sharp = (await import('sharp')).default
  const colors = ['#185F95', '#00424F', '#6B7F1E', '#7A3B2E', '#3E4A5C', '#8A5A00']
  const made: Array<number | string> = []
  for (const [i, c] of colors.entries()) {
    const alt = `Sample picture ${i + 1} (demonstration)`
    const found = await payload.find({ collection: 'media', where: { alt: { equals: alt } }, limit: 1, depth: 0, overrideAccess: true })
    if (found.docs[0]) {
      made.push(found.docs[0].id)
      continue
    }
    const file = path.join(os.tmpdir(), `sample-picture-${i + 1}.jpg`)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#101820"/></linearGradient></defs><rect width="1800" height="1200" fill="url(#g)"/><circle cx="${400 + i * 180}" cy="420" r="220" fill="#ffffff" fill-opacity="0.12"/><rect x="900" y="640" width="640" height="360" fill="#ffffff" fill-opacity="0.1"/></svg>`
    await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toFile(file)
    const doc = (await payload.create({ collection: 'media', data: { alt, credit: 'Generated for design review' } as never, filePath: file, overrideAccess: true, context: ctx })) as unknown as Doc
    made.push(doc.id)
  }
  const section = await ensure('sections', { slug: { equals: 'local-news' } }, { title: 'Local News' })
  const topic = await ensure('categories', { title: { equals: 'Growth & Development' } }, { title: 'Growth & Development' })
  const production = await ensure('productions', { title: { equals: 'Sample Show (demonstration)' } }, { title: 'Sample Show (demonstration)', kind: 'original', tagline: 'A demonstration show for design review', listed: true })
  const stories = [
    ['Sample story one: how the Gulf Coast plans for the next storm', 'web'],
    ['Sample story two: a night of songs at the Museum of Commerce', 'web'],
    ['Sample story three: what a year of rebuilding looks like', 'web'],
    ['Sample story four: the people who keep the station on the air', 'web'],
    ['Sample video story: a walk through the new reading room', 'video'],
    ['Sample episode: the first conversation of the season', 'audio'],
    ['Sample episode: the second conversation of the season', 'audio'],
  ] as const
  for (const [i, [title, format]] of stories.entries()) {
    await ensure('posts', { title: { equals: title } }, {
      title, dek: 'Demonstration text for design review; this is not reporting.', format, _status: 'published', source: 'wuwf',
      publishedAt: new Date(Date.now() - (i + 1) * 86_400_000).toISOString(), section: section.id, categories: [topic.id],
      ...(format === 'audio' ? { production: production.id } : {}),
      meta: { title, description: 'Demonstration text for design review; this is not reporting.', image: made[i % made.length] },
      content: { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: 'Demonstration text for design review; this is not reporting.', format: 0, mode: 'normal', style: '', detail: 0 }] }] } },
    }).catch((e: Error) => console.warn(`Could not make "${title}": ${e.message}`))
  }
  const artists: Doc[] = []
  for (const [i, name] of ['Pat Byrn', 'Julie Patcouli', 'Nicholas Edward Williams'].entries()) {
    artists.push(await ensure('artists', { name: { equals: name } }, { name, bio: 'Demonstration biography for design review.', photo: made[i] }))
  }
  for (const [i, days] of [9, 33, 61].entries()) {
    const title = `RadioLive demonstration night ${i + 1}`
    await ensure('performances', { title: { equals: title } }, { title, _status: 'published', startsAt: new Date(Date.now() + days * 86_400_000).toISOString(), venue: 'Museum of Commerce', lineup: artists.map((a) => a.id), photo: made[i] })
      .catch((e: Error) => console.warn(`Could not make "${title}": ${e.message}`))
  }
}

// ---------------------------------------------------------------- what is on this database
const first = async (collection: string, where: Record<string, unknown> | undefined, depth = 0): Promise<Doc | undefined> =>
  (await payload.find({ collection: collection as never, ...(where ? { where: where as never } : {}), limit: 1, depth, sort: '-createdAt', overrideAccess: true, draft: false })).docs[0] as unknown as Doc | undefined

const photos = await payload.find({ collection: 'media', where: { mimeType: { like: 'image/' } }, limit: 200, depth: 0, sort: 'id', overrideAccess: true })
const { choosePlaceholderPhotos } = await import('../staging-demo/placeholder-pictures')
const chosen = choosePlaceholderPhotos(photos.docs as never[], 6)
const mediaIds = (chosen.length > 0 ? chosen : (photos.docs as unknown as Doc[]).filter((m) => (m.width as number | undefined) && (m.width as number) >= 800).slice(0, 6)).map((m) => m.id)

const post = await first('posts', { and: [{ source: { equals: 'wuwf' } }, { format: { equals: 'web' } }, { _status: { equals: 'published' } }] }, 0)
const production = await first('productions', { kind: { equals: 'original' } })
const fellowship = await first('fellowships', undefined)
const refs: SampleRefs = {
  mediaIds,
  postId: post?.id,
  sectionId: idOf(post?.section),
  topicId: Array.isArray(post?.categories) ? idOf(post.categories[0]) : undefined,
  productionId: production?.id,
  fellowshipId: fellowship?.id,
  now: new Date(),
}
console.log('Found:', JSON.stringify({ ...refs, now: undefined, pictures: mediaIds.length }))
if (mediaIds.length === 0) console.log('  no suitable pictures in the media library: the Feature, Profile band and Featured record blocks will draw without one.')
for (const [k, v] of Object.entries({ post: refs.postId, section: refs.sectionId, topic: refs.topicId, production: refs.productionId, fellowship: refs.fellowshipId })) {
  if (v === undefined) console.log(`  no ${k} on this database: the blocks that read one draw nothing.`)
}

const sections = buildSampleSections(refs)
console.log(`The page: "${SAMPLE_PAGE.title}", ${sections.length} sections (${new Set(sections.map((s) => s.blockType)).size} blocks, ${new Set(sections.map((s) => s.tone)).size} tones).`)
if (!go) {
  console.log('Dry run: nothing written. Pass --go to write it.')
  process.exit(0)
}

const data = {
  title: SAMPLE_PAGE.title,
  slug: SAMPLE_PAGE.slug,
  template: 'sections',
  sections,
  noindex: true,
  noReferrer: true,
  meta: { title: SAMPLE_PAGE.title, description: SAMPLE_PAGE.summary },
  _status: publish ? 'published' : 'draft',
}
const existing = await payload.find({ collection: 'pages', where: { slug: { equals: SAMPLE_PAGE.slug } }, limit: 1, depth: 0, draft: true, overrideAccess: true })
const doc = existing.docs[0]
  ? await payload.update({ collection: 'pages', id: existing.docs[0].id, data: data as never, draft: !publish, overrideAccess: true, context: ctx })
  : await payload.create({ collection: 'pages', data: data as never, draft: !publish, overrideAccess: true, context: ctx })
console.log(`${existing.docs[0] ? 'Replaced' : 'Created'} page ${doc.id} (${publish ? `published at ${doc.path}` : 'draft: open it in the admin and use Live preview'}).`)
process.exit(0)
