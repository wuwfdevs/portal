import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { repairBodies } from '../../scripts/grove/repair-bodies-core'
import { convertStory } from '@/lib/grove'
import * as lex from '@/lib/grove/lexical'
import { countLinkLines, countTypedMarkup, visibleWords } from '@/lib/grove/repair'
import type { ConvertedStory, JsonObject } from '@/lib/grove/types'
import { ensureTestSection } from '../helpers/section'

// The body repair, against a real database: it must fix what it should, and leave alone everything else. Each story here is made
// the way the importer made one (the Grove id and path kept, a published story), but with the body the importer used to produce:
// the "RELATED:" line as a paragraph, and the headline's tags as typed characters.

const run = Date.now().toString(36)
let payload: Payload
const created: (string | number)[] = []
let section: string | number

const grovePage = (key: string, items: string[]): JsonObject => ({
  _template: '/core/article/ArticlePage.hbs',
  canonicalLink: `https://www.wuwf.org/local-news/2016-03-13/repair-${run}-${key}`,
  contentId: `${run}-${key}`,
  sourceOrganizationName: 'WUWF',
  headline: `Repair ${key} ${run}`,
  description: 'A story.',
  datePublishedISO: '2016-03-13T19:39:31Z',
  dateModifiedISO: '2016-03-14T01:03:45Z',
  authorName: 'A Reporter',
  primarySection: [],
  tags: [],
  articleBody: [{ items }],
  lead: [],
  audio: [],
})
const convert = (key: string, items: string[]): ConvertedStory => {
  const r = convertStory(grovePage(key, items), { embedHosts: [] })
  if (r.status !== 'converted') throw new Error('expected a converted story')
  return r.story
}

const RELATED = '<p><b>RELATED: </b><a href="/politics/2024-11-14/shocked">&lt;b&gt;\'I was shocked\': Lawmakers react&lt;/b&gt;</a></p>'
/** The body as the importer stored it before the converter knew the pattern: the label as bold text, the tags as characters. */
const oldRelatedBody = (intro: string) =>
  lex.root([
    lex.paragraph([lex.text(intro)]),
    lex.paragraph([lex.text('RELATED: ', lex.FORMAT.bold), lex.link('/politics/2024-11-14/shocked', false, [lex.text("<b>'I was shocked': Lawmakers react</b>")])]),
    lex.paragraph([lex.text('The end.')]),
  ])

async function importedStory(s: ConvertedStory, content: unknown) {
  const p = await payload.create({
    collection: 'posts',
    draft: false,
    overrideAccess: true,
    context: { disableRevalidate: true },
    data: {
      title: s.title, slug: s.slug, path: s.path, publishedAt: s.publishedAt, source: s.source, section, format: s.format,
      meta: { description: s.description },
      legacy: { legacyPath: s.legacy.legacyPath, groveId: s.legacy.groveId, modifiedAt: s.legacy.modifiedAt },
      content, _status: 'published',
    } as never,
  })
  created.push(p.id)
  return p
}
const read = (id: string | number) => payload.findByID({ collection: 'posts', id, depth: 0, overrideAccess: true, context: { disableRevalidate: true } })
const versionsOf = async (id: string | number) => (await payload.findVersions({ collection: 'posts', where: { parent: { equals: id } } as never, limit: 1, depth: 0, overrideAccess: true })).totalDocs
const rowFor = (rows: Awaited<ReturnType<typeof repairBodies>>, s: ConvertedStory) => rows.find((r) => r.groveId === s.legacy.groveId)

describe('repairing the bodies of stories already imported', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    section = await ensureTestSection(payload)
  }, 60_000)
  afterAll(async () => {
    for (const id of created) await payload.delete({ collection: 'posts', id, overrideAccess: true, context: { disableRevalidate: true } }).catch(() => undefined)
  })

  it('a dry run says what it would repair and writes nothing; applying it repairs the body, and only the body', async () => {
    const s = convert('a', ['<p>Intro.</p>', RELATED, '<p>The end.</p>'])
    const post = await importedStory(s, oldRelatedBody('Intro.'))
    expect(countLinkLines(post.content)).toBe(0)
    expect(countTypedMarkup(post.content)).toBe(1)

    const dry = await repairBodies(payload, [s], { only: `repair-${run}-a` })
    expect(rowFor(dry, s)).toMatchObject({ verdict: 'would-repair', linkLinesAdded: 1, typedMarkupPieces: 1 })
    expect(countLinkLines((await read(post.id)).content)).toBe(0)
    expect(await versionsOf(post.id)).toBe(1)

    const done = await repairBodies(payload, [s], { apply: true, only: `repair-${run}-a` })
    expect(rowFor(done, s)).toMatchObject({ verdict: 'repaired' })
    const after = await read(post.id)
    expect(countLinkLines(after.content)).toBe(1)
    expect(countTypedMarkup(after.content)).toBe(0)
    expect(visibleWords(after.content)).toBe(visibleWords(post.content)) // a reader reads the same words
    expect(JSON.stringify(after.content)).not.toContain('<b>')
    expect({ title: after.title, path: after.path, publishedAt: after.publishedAt, slug: after.slug }).toEqual({ title: post.title, path: post.path, publishedAt: post.publishedAt, slug: post.slug })
    expect(after._status).toBe('published')
  })

  it('running it again changes nothing (the repaired story is current)', async () => {
    const s = convert('a', ['<p>Intro.</p>', RELATED, '<p>The end.</p>'])
    const again = await repairBodies(payload, [s], { apply: true, only: `repair-${run}-a` })
    expect(rowFor(again, s)).toMatchObject({ verdict: 'unchanged' })
  })

  it('leaves a story alone that an editor has worked on since the import, even with the same words', async () => {
    const s = convert('b', ['<p>Intro.</p>', RELATED, '<p>The end.</p>'])
    const post = await importedStory(s, oldRelatedBody('Intro.'))
    await payload.update({ collection: 'posts', id: post.id, data: { content: oldRelatedBody('Intro.') } as never, overrideAccess: true, context: { disableRevalidate: true } })
    expect(await versionsOf(post.id)).toBeGreaterThan(1)
    const rows = await repairBodies(payload, [s], { apply: true, only: `repair-${run}-b` })
    expect(rowFor(rows, s)).toMatchObject({ verdict: 'skipped-edited' })
    expect(countLinkLines((await read(post.id)).content)).toBe(0)
  })

  it('leaves a story alone when the words a reader reads would change', async () => {
    const s = convert('c', ['<p>Intro.</p>', RELATED, '<p>The end.</p>'])
    const post = await importedStory(s, oldRelatedBody('Intro, but written differently.'))
    const rows = await repairBodies(payload, [s], { apply: true, only: `repair-${run}-c` })
    expect(rowFor(rows, s)).toMatchObject({ verdict: 'skipped-words-differ' })
    expect(countLinkLines((await read(post.id)).content)).toBe(0)
  })

  it('leaves a story alone whose pictures are not all in the library, and never creates a file', async () => {
    const s = convert('d', ['<p>Intro.</p>', '<p><img src="https://npr.brightspotcdn.com/aa/bb/photo.jpg" alt="x"></p>', RELATED, '<p>The end.</p>'])
    expect(s.assets.length).toBeGreaterThan(0)
    const post = await importedStory(s, oldRelatedBody('Intro.'))
    const rows = await repairBodies(payload, [s], { apply: true, only: `repair-${run}-d` })
    expect(rowFor(rows, s)).toMatchObject({ verdict: 'skipped-missing-files' })
    expect(countLinkLines((await read(post.id)).content)).toBe(0)
  })

  it('says so when a story has no Grove page among the pages given, and when a story needs nothing', async () => {
    const orphan = convert('e', ['<p>Intro.</p>', RELATED, '<p>The end.</p>'])
    await importedStory(orphan, oldRelatedBody('Intro.'))
    const plain = convert('f', ['<p>Nothing to repair here.</p>'])
    await importedStory(plain, lex.root([lex.paragraph([lex.text('Nothing to repair here.')])]))
    const rows = await repairBodies(payload, [plain], { apply: true, only: `repair-${run}-` })
    expect(rows.find((r) => r.groveId === orphan.legacy.groveId)).toMatchObject({ verdict: 'skipped-no-source-page' })
    expect(rowFor(rows, plain)).toMatchObject({ verdict: 'unchanged' })
  })

  it('stops after the limit', async () => {
    const one = convert('g1', ['<p>Intro.</p>', RELATED, '<p>The end.</p>'])
    const two = convert('g2', ['<p>Intro.</p>', RELATED, '<p>The end.</p>'])
    await importedStory(one, oldRelatedBody('Intro.'))
    await importedStory(two, oldRelatedBody('Intro.'))
    const rows = await repairBodies(payload, [one, two], { only: `repair-${run}-g`, limit: 1 })
    expect(rows.filter((r) => r.verdict === 'would-repair')).toHaveLength(1)
  })
})
