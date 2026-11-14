// Demonstration content for the STAGING site, so every feature has something to show: The Voyager, Unearthing Florida (map, timeline,
// collections, then & now), short vertical video, RadioLive, and (when given a question) WUWF Listens asks in stories.
//
//   pnpm seed:staging                                   dry run: says what it would create, writes nothing
//   pnpm seed:staging --go                              creates it (staging only)
//   pnpm seed:staging --go --listening-question <code>  also places a Listens ask (a question's 16-character code or address from the Portal)
//   pnpm seed:staging --go --local-rehearsal            runs against a database on this machine instead (to try it out)
//
// Needs the staging environment as `.env.local` (DATABASE_URL, PAYLOAD_SECRET and the S3 variables, so files go to the staging bucket).
//
// Rules this script keeps:
//  - It refuses any database that is not staging (an allow-list of one project, `lib/assets/staging-guard.ts`), production included.
//  - Everything it makes is labelled "demonstration" in its text. None of it is reporting, and no person in it is real.
//  - It is safe to run twice: each record is found by its title or name first. It never changes something an editor has already set
//    (a hub's chosen production, an episode that already has a place or a period).
//  - It sends nothing: no email, no Portal call, no embedding (`disableEmbedding`).

import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Payload } from 'payload'

import { checkStagingDatabase } from '../../src/lib/assets/staging-guard'

dotenv.config({ path: '.env.local' })
dotenv.config()

const args = process.argv.slice(2)
const go = args.includes('--go')
const local = args.includes('--local-rehearsal')
const qIndex = args.indexOf('--listening-question')
const listeningQuestion = qIndex >= 0 ? args[qIndex + 1] : undefined

const guard = checkStagingDatabase(process.env.DATABASE_URL, { allowLocal: local })
if (!guard.ok) throw new Error(`Refusing to seed: ${guard.reason}`)
console.log(`${go ? 'SEEDING' : 'Dry run against'} ${guard.where}.`)

const here = path.dirname(fileURLToPath(import.meta.url))
const asset = (name: string) => path.join(here, 'assets', name)

const para = (text: string) => ({
  type: 'paragraph', version: 1, direction: 'ltr' as const, format: '' as const, indent: 0,
  children: [{ type: 'text', version: 1, text, format: 0, mode: 'normal' as const, style: '', detail: 0 }],
})
const lexical = (...children: unknown[]) => ({ root: { type: 'root', version: 1, direction: 'ltr' as const, format: '' as const, indent: 0, children } })
const body = (...paras: string[]) => lexical(...paras.map(para))
const block = (blockType: string, fields: Record<string, unknown>) => ({ type: 'block', version: 2, format: '' as const, fields: { id: `demo-${blockType}`, blockType, ...fields } })
const DEMO = 'Demonstration content for the staging site; this is not reporting.'

const { getPayload } = await import('payload')
const { default: config } = await import('@payload-config')
const payload: Payload = await getPayload({ config })
const ctx = { disableRevalidate: true, disableEmbedding: true }
const made: string[] = []

type Doc = { id: string | number } & Record<string, unknown>

async function ensure(collection: string, where: Record<string, unknown>, data: Record<string, unknown>, label: string, extra: Record<string, unknown> = {}): Promise<Doc> {
  const found = await payload.find({ collection: collection as never, where: where as never, limit: 1, depth: 0, overrideAccess: true, draft: false })
  if (found.docs[0]) return found.docs[0] as unknown as Doc
  made.push(`${collection}: ${label}`)
  if (!go) return { id: `(new ${label})` }
  return (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx, ...extra })) as unknown as Doc
}
const byTitle = (t: string) => ({ title: { equals: t } })
const byName = (n: string) => ({ name: { equals: n } })

// ---------------------------------------------------------------- shared pieces
await ensure('publishing-identities', byName('WUWF News'), { name: 'WUWF News', kind: 'newsroom', tagline: "NPR for Florida's Great Northwest" }, 'WUWF News')
await ensure('media', { alt: { equals: 'WUWF 88.1 wordmark' } }, { alt: 'WUWF 88.1 wordmark' }, 'logo image', { filePath: path.resolve('public/wuwf-logo.png') })
const sectionNews = await ensure('sections', { slug: { equals: 'local-news' } }, { title: 'Local News' }, 'section Local News')

// ---------------------------------------------------------------- The Voyager
const voyager = await ensure('publishing-identities', { slug: { equals: 'the-voyager' } }, { name: 'The Voyager', kind: 'partner', tagline: 'The student newspaper of the University of West Florida' }, 'The Voyager identity')
const voySections: Doc[] = []
for (const t of ['Campus', 'Sports', 'Arts & Life', 'Opinion']) voySections.push(await ensure('sections', { title: { equals: t } }, { title: t }, `section ${t}`))
const students = [
  ['Avery Demo', 'Editor in chief'],
  ['Jordan Sample', 'News editor'],
  ['Riley Placeholder', 'Sports reporter'],
  ['Sam Illustrative', 'Photo editor'],
] as const
const people: Doc[] = []
for (const [name, title] of students) people.push(await ensure('contributors', byName(name), { name, title, bio: `Illustrative profile. ${DEMO}` }, `contributor ${name}`))
const voyagerPod = await ensure('productions', byTitle('The Voyager Weekly (demonstration)'), { title: 'The Voyager Weekly (demonstration)', kind: 'original', tagline: 'Campus news in fifteen minutes', summary: DEMO }, 'Voyager podcast')

const voyagerStories: [string, number, number, number, string][] = [
  // title, section index, author index, days ago, dek
  ['Demonstration: Student government votes on a new meal plan', 0, 1, 1, 'A made-up story that fills the hub’s lead slot.'],
  ['Demonstration: Argonauts open the season at home', 1, 2, 2, 'A made-up sports story.'],
  ['Demonstration: The new mural outside the library', 2, 3, 3, 'A made-up arts story.'],
  ['Demonstration: Why the quad needs more shade', 3, 0, 4, 'A made-up opinion piece.'],
  ['Demonstration: Dorm renovations reach the second phase', 0, 1, 5, 'Another made-up campus story.'],
  ['Demonstration: Intramural volleyball returns', 1, 2, 6, 'Another made-up sports story.'],
]
const dayAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const voyagerPosts: Doc[] = []
for (const [title, s, a, d, dek] of voyagerStories) {
  voyagerPosts.push(await ensure('posts', byTitle(title), {
    title, dek, format: 'web', _status: 'published', publishedAt: dayAgo(d), section: voySections[s].id, publishingIdentity: voyager.id, contributors: [people[a].id],
    content: body(DEMO, 'The Voyager is written by UWF students. This text exists so the hub, the section lists and the story page have something to show.'),
  }, `Voyager story "${title}"`))
}

// The hub itself: sections, staff, podcast and the join band, only where an editor has not chosen already.
{
  const hub = (await payload.findGlobal({ slug: 'voyager-hub', depth: 0, overrideAccess: true })) as { sections?: unknown[]; staff?: unknown[]; podcast?: unknown; join?: { text?: string | null; href?: string | null } }
  const patch: Record<string, unknown> = {}
  if (!hub.sections?.length) patch.sections = voySections.map((s) => s.id)
  if (!hub.staff?.length) patch.staff = students.map(([, role], i) => ({ person: people[i].id, role }))
  if (!hub.podcast) patch.podcast = voyagerPod.id
  if (!hub.join?.text) patch.join = { heading: 'Write for The Voyager (demonstration)', text: DEMO, href: 'https://example.org/voyager-join' }
  if (Object.keys(patch).length) {
    made.push('voyager-hub: sections, staff, podcast, join')
    if (go) await payload.updateGlobal({ slug: 'voyager-hub', data: patch as never, overrideAccess: true, context: ctx })
  }
}

// ---------------------------------------------------------------- Short vertical video
const videoFile = await ensure('video', byTitle('Demonstration vertical clip'), { title: 'Demonstration vertical clip', credit: 'WUWF (demonstration)', durationSeconds: 6, description: DEMO }, 'video file', { filePath: asset('demo-vertical.mp4') })
const poster = await ensure('media', { alt: { equals: 'A test pattern with the words Demo clip' } }, { alt: 'A test pattern with the words Demo clip' }, 'clip poster', { filePath: asset('demo-vertical-poster.jpg') })
if (go && videoFile.id && poster.id && !(videoFile as { poster?: unknown }).poster) {
  await payload.update({ collection: 'video', id: videoFile.id, data: { poster: poster.id } as never, overrideAccess: true, context: ctx })
}
const clipSeries = await ensure('series', byTitle('Campus in a minute (demonstration)'), { title: 'Campus in a minute (demonstration)', summary: DEMO }, 'clip series')
const captions = 'WEBVTT\n\n00:00.000 --> 00:03.000\nThis is a demonstration clip.\n\n00:03.000 --> 00:06.000\nIt exists to show the short video pages.\n'
const clipTitles = ['Demonstration clip: a minute on the quad', 'Demonstration clip: game day', 'Demonstration clip: the mural up close', 'Demonstration clip: students on the shuttle']
for (const [i, title] of clipTitles.entries()) {
  await ensure('clips', byTitle(title), {
    title, description: DEMO, video: videoFile.id, captionsVtt: captions, series: clipSeries.id, story: voyagerPosts[i % voyagerPosts.length]?.id,
    _status: 'published', publishedAt: dayAgo(i),
  }, `clip "${title}"`)
}
// A video story for The Voyager's Multimedia band.
await ensure('posts', byTitle('Demonstration: Voyager video report'), {
  title: 'Demonstration: Voyager video report', dek: DEMO, format: 'video', _status: 'published', publishedAt: dayAgo(1), section: voySections[0].id,
  publishingIdentity: voyager.id, contributors: [people[3].id], content: body(DEMO),
  featuredMedia: [{ blockType: 'videoPlayer', video: videoFile.id, title: 'Demonstration video report', caption: DEMO, poster: poster.id }],
}, 'Voyager video story')

// ---------------------------------------------------------------- Unearthing Florida
const unearthing = (await payload.find({ collection: 'productions', where: { slug: { equals: 'unearthing-florida' } }, limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as Doc | undefined
const sites: Record<string, Doc> = {}
const siteSpecs: [string, string, string, string, string, number, number][] = [
  // key, name, short, place, era, x, y
  ['stAug', 'St. Augustine', 'St. Augustine', 'St. Augustine', 'spanish', 88, 28],
  ['mound', 'Mound Key', 'Mound Key', 'Estero Bay', 'native', 70, 80],
  ['pensacola', 'Pensacola Bay', 'Pensacola', 'Pensacola', 'american', 8, 10],
  ['soto', 'Soto’s route', 'Soto', 'North Florida', 'spanish', 40, 18],
  ['quincy', 'Gadsden County', 'Quincy', 'Quincy', 'american', 30, 14],
  ['fortGeorge', 'Fort George', 'Fort George', 'Pensacola', 'british', 10, 12],
]
for (const [key, name, short, place, era, x, y] of siteSpecs) {
  sites[key] = await ensure('sites', byName(name), { name, short, place, era, mapX: x, mapY: y, description: `${DEMO} A pin for the hub’s map.` }, `site ${name}`)
}
const uSeries: Record<string, Doc> = {}
for (const t of ['Forts and frontiers (demonstration)', 'Storms and rebuilding (demonstration)']) uSeries[t] = await ensure('series', byTitle(t), { title: t, summary: DEMO }, `series ${t}`)
const [seriesForts, seriesStorms] = Object.values(uSeries)

if (unearthing) {
  // Give the episodes already on the hub a place, a period and a collection, only where empty (never override an editor).
  const existing: [string, string, string, Doc][] = [
    ['The start of St. Augustine', 'stAug', 'first-spanish', seriesForts],
    ['Mound Key Park is a unique Florida treasure', 'mound', 'woodland-mississippian', seriesForts],
    ["Highlighting the diversity at St. Michael's Cemetery", 'pensacola', 'territory-statehood', seriesStorms],
    ['The bloody battle between Soto’s army and the Coosa Indians', 'soto', 'first-spanish', seriesForts],
    ['How tobacco plantations built some Florida towns', 'quincy', 'territory-statehood', seriesStorms],
  ]
  for (const [title, siteKey, period, series] of existing) {
    const found = (await payload.find({ collection: 'posts', where: { and: [byTitle(title), { production: { equals: unearthing.id } }] } as never, limit: 1, depth: 0, overrideAccess: true, draft: false })).docs[0] as unknown as (Doc & { site?: unknown; period?: unknown; series?: unknown }) | undefined
    if (!found) continue
    const patch: Record<string, unknown> = {}
    if (!found.site && sites[siteKey]) patch.site = sites[siteKey].id
    if (!found.period) patch.period = period
    if (!found.series && series) patch.series = series.id
    if (Object.keys(patch).length) {
      made.push(`posts: place/period/collection on "${title}"`)
      if (go) await payload.update({ collection: 'posts', id: found.id, data: patch as never, overrideAccess: true, context: ctx, draft: false })
    }
  }
  const extras: [string, string, string, Doc, number][] = [
    ['Demonstration episode: A British fort on Pensacola Bay', 'fortGeorge', 'british-west-florida', seriesForts, 40],
    ['Demonstration episode: Rebuilding after the storm of 1821', 'pensacola', 'second-spanish', seriesStorms, 30],
    ['Demonstration episode: Before the Spanish arrived', 'mound', 'paleoindian-archaic', seriesForts, 20],
  ]
  const added: Doc[] = []
  for (const [title, siteKey, period, series, d] of extras) {
    added.push(await ensure('posts', byTitle(title), {
      title, dek: DEMO, format: 'audio', _status: 'published', publishedAt: dayAgo(d * 30), section: sectionNews.id, production: unearthing.id,
      site: sites[siteKey].id, period, series: series.id, content: body(DEMO, 'An episode page with no audio file attached, to fill the hub’s map, timeline and collections.'),
    }, `Unearthing episode "${title}"`))
  }
  // "Now": a news story to pair with a history episode.
  const nowStory = await ensure('posts', byTitle('Demonstration: Rebuilding on the coast, today'), {
    title: 'Demonstration: Rebuilding on the coast, today', dek: DEMO, format: 'web', _status: 'published', publishedAt: dayAgo(3), section: sectionNews.id,
    content: body(DEMO, 'A current news story to pair with a history episode in the hub’s “Then & now” band.'),
  }, 'a "now" news story')
  const hub = (await payload.findGlobal({ slug: 'unearthing-hub', depth: 0, overrideAccess: true })) as { thenNow?: { pairs?: unknown[] }; dateline?: string; about?: string }
  const patch: Record<string, unknown> = {}
  if (!hub.dateline) patch.dateline = 'Northwest Florida to the Keys (demonstration)'
  if (!hub.about) patch.about = `${DEMO} Unearthing Florida tells stories of the state’s buried and forgotten history.`
  if (!hub.thenNow?.pairs?.length && added[1] && nowStory) patch.thenNow = { heading: 'People have rebuilt on this coast after storms for 500 years.', blurb: DEMO, pairs: [{ then: added[1].id, now: nowStory.id }] }
  if (Object.keys(patch).length) {
    made.push('unearthing-hub: dateline, about, then & now')
    if (go) await payload.updateGlobal({ slug: 'unearthing-hub', data: patch as never, overrideAccess: true, context: ctx })
  }
} else {
  console.log('! No Unearthing Florida production here; skipped its demonstration (run the migrations first).')
}

// ---------------------------------------------------------------- WUWF Listens asks
if (listeningQuestion) {
  await ensure('posts', byTitle('Demonstration: A story with a question for you'), {
    title: 'Demonstration: A story with a question for you', dek: DEMO, format: 'web', _status: 'published', publishedAt: dayAgo(2), section: sectionNews.id,
    content: lexical(
      para(DEMO),
      para('The box below is a WUWF Listens question. The question itself lives in the Portal; this page only shows it.'),
      block('listeningAsk', { question: listeningQuestion, variant: 'story' }),
      para('Text after the question.'),
    ),
  }, 'story with a Listens ask')
  if (unearthing) {
    // The voice variant goes at the end of an episode; one listening component per page, so a separate episode carries it.
    await ensure('posts', byTitle('Demonstration episode: Ask the team (voice question)'), {
      title: 'Demonstration episode: Ask the team (voice question)', dek: DEMO, format: 'audio', _status: 'published', publishedAt: dayAgo(10), section: sectionNews.id, production: unearthing.id,
      site: sites.stAug?.id, period: 'first-spanish',
      content: lexical(para(DEMO), block('listeningAsk', { question: listeningQuestion, variant: 'voice', recipient: 'the Unearthing Florida team', description: 'Tell us a story from your town.' })),
    }, 'episode with a voice Listens ask')
  }
} else {
  console.log('- Skipping WUWF Listens asks: pass --listening-question <code> with a question that is open in the Portal.')
}

// ---------------------------------------------------------------- RadioLive
const artists: Doc[] = []
for (const n of ['Demo Artist One', 'Demo Artist Two', 'Demo Artist Three']) artists.push(await ensure('artists', byName(n), { name: n, bio: `Illustrative profile. ${DEMO}` }, `artist ${n}`))
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()
await ensure('performances', byTitle('Demonstration show: an upcoming night'), {
  title: 'Demonstration show: an upcoming night', startsAt: inDays(21), description: DEMO, lineup: artists.map((a) => a.id), _status: 'published',
  ticketsStatus: 'onSale', ticketsUrl: 'https://example.org/tickets',
}, 'RadioLive upcoming show')
await ensure('performances', byTitle('Demonstration show: a recorded night'), {
  title: 'Demonstration show: a recorded night', startsAt: inDays(-30), description: DEMO, lineup: artists.slice(0, 2).map((a) => a.id), _status: 'published',
  video: videoFile.id, captionsVtt: captions,
}, 'RadioLive recorded show')

// ---------------------------------------------------------------- report
console.log(`\n${go ? 'Created' : 'Would create'} ${made.length} item(s):`)
for (const m of made) console.log(`  + ${m}`)
if (!go) console.log('\nNothing was written. Run again with --go.')
else console.log('\nPages refresh on their own schedule (the hubs within 10 to 60 minutes) or on the next deploy, because this script does not revalidate.')
process.exit(0)
