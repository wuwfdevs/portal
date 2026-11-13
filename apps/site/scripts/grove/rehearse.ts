// A LOCAL rehearsal of the import: convert a handful of real Grove pages and save them into the local development
// database, with generated placeholder files standing in for the real images and audio, so the stories can be looked
// at in a browser. It fetches nothing. It refuses any database that is not on this machine.
//
//   pnpm exec tsx scripts/grove/rehearse.ts --raw <dir> --manifest census/manifest.jsonl [--hosts a,b] [--count 8]
//
// This is not the importer: the real one saves the real files (after the owner approves fetching them). The path from
// converted story to saved story is the same, which is what this proves.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

import dotenv from 'dotenv'
import sharp from 'sharp'

dotenv.config({ path: '.env.local' })
dotenv.config()
const host = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/none').hostname
if (!['localhost', '127.0.0.1', '::1', 'db'].includes(host)) throw new Error(`Refusing to rehearse into a non-local database (${host}).`)

const { getPayload } = await import('payload')
const config = (await import('../../src/payload.config')).default
const { convertStory, resolveAssets } = await import('../../src/lib/grove')
type ConvertedStory = import('../../src/lib/grove').ConvertedStory

const args = process.argv.slice(2)
const flag = (n: string) => args.flatMap((a, i) => (a === `--${n}` ? [args[i + 1] ?? ''] : []))
const raw = flag('raw')
const hosts = (flag('hosts')[0] ?? '').split(',').filter(Boolean)
const count = Number(flag('count')[0] ?? 8)

const files: string[] = []
const walk = (d: string) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.json.gz')) files.push(p)
  }
}
raw.forEach(walk); files.sort()

// Pick a varied handful: the first story that shows each feature we want to see.
const wanted: [string, (m: Record<string, number>) => boolean][] = [
  ['a featured gallery', (m) => (m['lead:gallery'] ?? 0) > 0],
  ['an audio block', (m) => (m['block:audioPlayer'] ?? 0) > 0],
  ['a tweet', (m) => (m['embed:x'] ?? 0) > 0],
  ['a Facebook post', (m) => (m['embed:facebook'] ?? 0) > 0],
  ['a table', (m) => (m['block:legacyHtml'] ?? 0) > 0],
  ['inline pictures', (m) => (m['image:inline'] ?? 0) > 0],
  ['lists and headings', (m) => (m.list ?? 0) > 1 && (m.heading ?? 0) > 0],
  ['a video file', (m) => (m['block:videoPlayer'] ?? 0) > 0],
  ['a quotation', (m) => (m.quote ?? 0) > 0],
  ['a plain typical story', () => true],
]
const picked = new Map<string, { story: ConvertedStory; why: string }>()
for (const f of files) {
  const page = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'))
  const r = convertStory(page, { embedHosts: hosts })
  if (r.status !== 'converted' || r.report.status === 'exception') continue
  const why = wanted.find(([label, test]) => !picked.has(label) && test(r.report.mapped))
  if (why && !picked.has(why[0])) picked.set(why[0], { story: r.story, why: why[0] })
  if (picked.size >= count) break
}

const payload = await getPayload({ config })
const ctx = { disableRevalidate: true, disableEmbedding: true }

async function placeholderImage(url: string, w: number, h: number): Promise<Buffer> {
  const hue = parseInt(crypto.createHash('md5').update(url).digest('hex').slice(0, 4), 16) % 360
  const W = Math.min(w || 1200, 1200), H = Math.round(((h || 800) / (w || 1200)) * W)
  const label = url.split('/').pop()?.slice(0, 40) ?? ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="hsl(${hue},45%,38%)"/><text x="50%" y="50%" fill="white" font-size="${Math.max(18, W / 30)}" text-anchor="middle" font-family="sans-serif">placeholder: ${label.replace(/[<&]/g, '')}</text></svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}
const silentWav = (): Buffer => {
  const n = 8000 * 3
  const d = Buffer.alloc(44 + n, 0x80)
  d.write('RIFF', 0); d.writeUInt32LE(36 + n, 4); d.write('WAVE', 8); d.write('fmt ', 12); d.writeUInt32LE(16, 16)
  d.writeUInt16LE(1, 20); d.writeUInt16LE(1, 22); d.writeUInt32LE(8000, 24); d.writeUInt32LE(8000, 28); d.writeUInt16LE(1, 32); d.writeUInt16LE(8, 34)
  d.write('data', 36); d.writeUInt32LE(n, 40)
  return d
}

const findOrCreate = async (collection: 'sections' | 'categories' | 'contributors', field: string, value: string, data: Record<string, unknown>) => {
  const found = await payload.find({ collection, where: { [field]: { equals: value } }, limit: 1, depth: 0, overrideAccess: true })
  if (found.docs[0]) return found.docs[0].id
  return (await payload.create({ collection, data: data as never, overrideAccess: true, context: ctx })).id
}

for (const { story, why } of picked.values()) {
  const existing = await payload.find({ collection: 'posts', where: { 'legacy.groveId': { equals: story.legacy.groveId } }, limit: 1, depth: 0, overrideAccess: true })
  if (existing.docs[0]) { console.log(`already there  ${story.path}`); continue }

  const ids = new Map<string, number | string>()
  for (const a of story.assets) {
    const found = await payload.find({ collection: a.kind === 'image' ? 'media' : a.kind === 'video' ? 'video' : 'audio', where: { 'legacy.sourceUrl': { equals: a.sourceUrl } }, limit: 1, depth: 0, overrideAccess: true })
    if (found.docs[0]) { ids.set(a.sourceUrl, found.docs[0].id); continue }
    const name = a.sourceUrl.split('/').pop()?.split('?')[0] ?? 'file'
    if (a.kind === 'image') {
      const data = await placeholderImage(a.sourceUrl, a.width ?? 1200, a.height ?? 800)
      const doc = await payload.create({ collection: 'media', overrideAccess: true, context: ctx, file: { data, mimetype: 'image/png', name: `${name}.png`, size: data.length }, data: { alt: a.alt ?? '', ...(a.credit ? { credit: a.credit } : {}), ...(a.source ? { source: a.source } : {}), legacy: { sourceUrl: a.sourceUrl } } as never })
      ids.set(a.sourceUrl, doc.id)
    } else if (a.kind === 'video') {
      const data = fs.readFileSync(path.resolve(import.meta.dirname, '../../tests/fixtures/one-second.mp4'))
      const doc = await payload.create({ collection: 'video', overrideAccess: true, file: { data, mimetype: 'video/mp4', name: name.endsWith('.mp4') ? name : `${name}.mp4`, size: data.length }, data: { title: a.title ?? name, legacy: { sourceUrl: a.sourceUrl } } as never })
      ids.set(a.sourceUrl, doc.id)
    } else {
      const data = silentWav()
      const doc = await payload.create({ collection: 'audio', overrideAccess: true, file: { data, mimetype: 'audio/wav', name: `${name}.wav`, size: data.length }, data: { title: a.title ?? name, ...(a.durationSeconds ? { durationSeconds: a.durationSeconds } : {}), legacy: { sourceUrl: a.sourceUrl } } as never })
      ids.set(a.sourceUrl, doc.id)
    }
  }
  const resolved = resolveAssets({ content: story.content, featuredMedia: story.featuredMedia, featuredAudio: story.featuredAudio, people: story.byline.people }, ids)

  const section = story.section ? await findOrCreate('sections', 'title', story.section.title, { title: story.section.title }) : undefined
  const categories = [] as (number | string)[]
  for (const t of story.topics) categories.push(await findOrCreate('categories', 'title', t.title, { title: t.title }))
  const contributors = [] as (number | string)[]
  for (const p of resolved.people) contributors.push(await findOrCreate('contributors', 'name', p.name, { name: p.name, ...(p.title ? { title: p.title } : {}), ...(p.bio ? { bio: p.bio } : {}), ...(p.photo ? { photo: p.photo } : {}) }))

  const post = await payload.create({
    collection: 'posts', overrideAccess: true, context: ctx,
    data: {
      title: story.title, slug: story.slug, path: story.path, publishedAt: story.publishedAt, source: story.source,
      ...(section ? { section } : {}), categories, contributors,
      meta: { description: story.description },
      legacy: { legacyPath: story.legacy.legacyPath, groveId: story.legacy.groveId, modifiedAt: story.legacy.modifiedAt },
      content: resolved.content, featuredMedia: resolved.featuredMedia, ...(resolved.featuredAudio ? { featuredAudio: resolved.featuredAudio } : {}), _status: 'published',
    } as never,
  })
  console.log(`saved  ${String(post.id).padStart(4)}  ${why.padEnd(22)} ${story.path}`)
}
process.exit(0)
