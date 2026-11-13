// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from '@/lib/embeddings/config'
import { loadRelatedStories } from '@/lib/embeddings/related'
import { semanticStories } from '@/lib/embeddings/search'
import { embedStories, embedStory } from '@/lib/embeddings/service'
import { allEmbeddedPostIds, nearestToStory, nearestToVector, storedEmbeddings, upsertEmbedding } from '@/lib/embeddings/store'

// Story embeddings against a real pgvector database: the table and its cascade, staleness by hash, the save hook (and what it must not
// do), similar stories (published only, floor, series cap) and semantic search (published only, kind filter, floor). The provider is a
// fake that turns a few topic words into axes, so a story "about floods" sits at a known angle to one "about music". Nothing leaves the machine.

const TOPICS = ['flood', 'music', 'school', 'port']
const unit = (axis: number): number[] => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === axis ? 1 : 0))
const mix = (a: number, b: number, wa: number, wb: number): number[] => {
  const n = Math.hypot(wa, wb)
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === a ? wa / n : i === b ? wb / n : 0))
}
/** Text -> vector: the sum of the axes of the topic words it contains (axis 10 when it has none), made unit length. */
function textToVector(text: string): number[] {
  const lower = text.toLowerCase()
  const axes = TOPICS.flatMap((t, i) => (lower.includes(t) ? [i] : []))
  const v = Array<number>(EMBEDDING_DIMENSIONS).fill(0)
  for (const a of axes.length ? axes : [10]) v[a] = 1
  const norm = Math.hypot(...v)
  return v.map((x) => x / norm)
}

const mocks = vi.hoisted(() => ({ embed: vi.fn() }))
vi.mock('@/lib/embeddings/service', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/embeddings/service')>()
  const fake = { model: 'text-embedding-3-small', dimensions: 1536, embed: mocks.embed }
  return { ...original, getEmbeddingProvider: () => fake }
})
mocks.embed.mockImplementation(async (inputs: string[]) => inputs.map(textToVector))

const run = Date.now().toString(36)
const fakeProvider = { model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS, embed: mocks.embed }
let payload: Payload
let section: number | string
const created: { collection: string; id: number }[] = []
const ctx = { disableRevalidate: true, disableEmbedding: true }
const para = (text: string) => ({ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text, format: 0, mode: 'normal', style: '', detail: 0 }] })
const body = (text: string) => ({ root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [para(text)] } })

async function story(title: string, data: Record<string, unknown> = {}, context: Record<string, unknown> = ctx) {
  const doc = (await payload.create({
    collection: 'posts',
    overrideAccess: true,
    context: { ...context },
    data: { title: `${title} ${run}`, content: body(title), _status: 'published', section, publishedAt: '2090-01-02T12:00:00.000Z', ...data } as never,
  })) as unknown as { id: number; _status: string; title: string }
  created.push({ collection: 'posts', id: doc.id })
  return doc
}
const embedded = async (id: number) => (await storedEmbeddings(payload, [id])).get(id)

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  const { ensureTestSection } = await import('../helpers/section')
  section = await ensureTestSection(payload)
}, 90_000)

afterAll(async () => {
  for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  delete process.env.OPENAI_API_KEY
})

describe('the vector table', () => {
  it('stores a vector per story, orders neighbours by cosine similarity, and never returns the story itself', async () => {
    const a = await story('Table A')
    const b = await story('Table B')
    const c = await story('Table C')
    await upsertEmbedding(payload, a.id, unit(0), EMBEDDING_MODEL, 'h-a')
    await upsertEmbedding(payload, b.id, mix(0, 1, 1, 1), EMBEDDING_MODEL, 'h-b') // 45 degrees from A
    await upsertEmbedding(payload, c.id, unit(1), EMBEDDING_MODEL, 'h-c') // at right angles to A
    const near = (await nearestToStory(payload, a.id, 50)).filter((n) => [b.id, c.id].includes(n.postId))
    expect(near.map((n) => n.postId)).toEqual([b.id, c.id])
    expect(near[0].similarity).toBeCloseTo(Math.SQRT1_2, 3)
    expect(near[1].similarity).toBeCloseTo(0, 3)
    expect((await nearestToStory(payload, a.id, 50)).some((n) => n.postId === a.id)).toBe(false)
    expect((await nearestToVector(payload, unit(0), 50, { exceptPostId: a.id })).some((n) => n.postId === a.id)).toBe(false)
  })

  it('upserts in place, and a story with no vector has no neighbours', async () => {
    const a = await story('Upsert')
    await upsertEmbedding(payload, a.id, unit(2), EMBEDDING_MODEL, 'one')
    await upsertEmbedding(payload, a.id, unit(3), EMBEDDING_MODEL, 'two')
    expect((await embedded(a.id))?.contentHash).toBe('two')
    const bare = await story('No vector')
    expect(await nearestToStory(payload, bare.id, 5)).toEqual([])
  })

  it('refuses a malformed vector before it reaches SQL', async () => {
    const a = await story('Malformed')
    await expect(upsertEmbedding(payload, a.id, [Number.NaN], EMBEDDING_MODEL, 'x')).rejects.toThrow('Invalid embedding vector')
    await expect(upsertEmbedding(payload, a.id, [], EMBEDDING_MODEL, 'x')).rejects.toThrow('Invalid embedding vector')
  })

  it('removes a story\'s vector when the story is deleted', async () => {
    const a = await story('Cascade')
    await upsertEmbedding(payload, a.id, unit(4), EMBEDDING_MODEL, 'x')
    expect(await embedded(a.id)).toBeDefined()
    await payload.delete({ collection: 'posts', id: a.id, overrideAccess: true, context: ctx })
    expect(await embedded(a.id)).toBeUndefined()
    expect(await allEmbeddedPostIds(payload)).not.toContain(a.id)
  })
})

describe('embedStory', () => {
  it('embeds an eligible story once, and a re-save with the same text costs no provider call', async () => {
    const s = await story('A flood story')
    mocks.embed.mockClear()
    expect(await embedStory(payload, { ...s, content: body('A flood story'), source: 'wuwf' }, fakeProvider)).toBe('embedded')
    expect(mocks.embed).toHaveBeenCalledTimes(1)
    expect((await embedded(s.id))?.model).toBe(EMBEDDING_MODEL)
    expect(await embedStory(payload, { ...s, content: body('A flood story'), source: 'wuwf' }, fakeProvider)).toBe('unchanged')
    expect(mocks.embed).toHaveBeenCalledTimes(1)
    expect(await embedStory(payload, { ...s, content: body('A flood story, rewritten'), source: 'wuwf' }, fakeProvider)).toBe('embedded')
    expect(mocks.embed).toHaveBeenCalledTimes(2)
  })

  it('leaves out drafts, NPR and wire stories, and a story with no text, and calls the provider for none of them', async () => {
    mocks.embed.mockClear()
    const base = { id: 999999, title: 'T', content: body('Body') }
    expect(await embedStory(payload, { ...base, _status: 'draft', source: 'wuwf' }, fakeProvider)).toBe('skipped')
    expect(await embedStory(payload, { ...base, _status: 'published', source: 'npr' }, fakeProvider)).toBe('skipped')
    expect(await embedStory(payload, { ...base, _status: 'published', source: 'wire' }, fakeProvider)).toBe('skipped')
    expect(await embedStory(payload, { id: 999999, _status: 'published', source: 'wuwf' }, fakeProvider)).toBe('skipped')
    expect(mocks.embed).not.toHaveBeenCalled()
  })

  it('embeds a batch in one provider call and reports what it did; a dry run sends nothing and writes nothing', async () => {
    const one = await story('Batch one flood')
    const two = await story('Batch two music')
    const docs = [one, two].map((s) => ({ ...s, content: body(s.title), source: 'wuwf' }))
    mocks.embed.mockClear()
    const dry = await embedStories(payload, docs, fakeProvider, { dryRun: true })
    expect(dry).toMatchObject({ stale: 2, embedded: 0, unchanged: 0 })
    expect(mocks.embed).not.toHaveBeenCalled()
    expect(await embedded(one.id)).toBeUndefined()
    const real = await embedStories(payload, docs, fakeProvider)
    expect(real).toMatchObject({ stale: 2, embedded: 2 })
    expect(mocks.embed).toHaveBeenCalledTimes(1)
    expect(await embedStories(payload, docs, fakeProvider)).toMatchObject({ stale: 0, unchanged: 2, embedded: 0 })
  })
})

describe('the save hook', () => {
  it('embeds a story when it is published, and not when the importer says not to', async () => {
    const live = await story('Hook port story', {}, {})
    expect((await embedded(live.id))?.model).toBe(EMBEDDING_MODEL)
    const imported = await story('Imported port story', {}, { disableEmbedding: true })
    expect(await embedded(imported.id)).toBeUndefined()
  })

  it('does not embed an NPR story or a draft', async () => {
    const npr = await story('NPR port story', { source: 'npr' }, {})
    const draft = await story('Draft port story', { _status: 'draft' }, {})
    expect(await embedded(npr.id)).toBeUndefined()
    expect(await embedded(draft.id)).toBeUndefined()
  })

  it('keeps a published story\'s vector when a draft is saved over it', async () => {
    const live = await story('Hook school story', {}, {})
    expect(await embedded(live.id)).toBeDefined()
    await payload.update({ collection: 'posts', id: live.id, draft: true, overrideAccess: true, context: {}, data: { title: `Hook school story, draft edit ${run}` } as never })
    expect(await embedded(live.id)).toBeDefined()
  })

  it('never fails a save when the provider fails', async () => {
    mocks.embed.mockRejectedValueOnce(new Error('provider down'))
    const s = await story('Hook failing story', {}, {})
    expect(s.id).toBeGreaterThan(0)
    expect(await embedded(s.id)).toBeUndefined()
    expect(await embedStory(payload, { ...s, content: body('Hook failing story'), source: 'wuwf' }, fakeProvider)).toBe('embedded') // the next run catches up
  })
})

describe('similar stories', () => {
  it('offers published close stories only, above the floor, at most two from one show', async () => {
    const show = (await payload.create({ collection: 'productions', data: { title: `Series ${run}` } as never, overrideAccess: true, context: ctx })) as unknown as { id: number }
    created.push({ collection: 'productions', id: show.id })

    const me = await story('Related subject')
    const near = await story('Related near', { publishedAt: '2090-01-05T12:00:00.000Z' })
    const draft = await story('Related draft neighbour', { _status: 'draft' })
    const far = await story('Related far')
    const ep = [await story('Related ep 1', { production: show.id, format: 'audio' }), await story('Related ep 2', { production: show.id, format: 'audio' }), await story('Related ep 3', { production: show.id, format: 'audio' })]

    // Its own pair of axes (20, 21): stories left by the other tests sit on axes 0 to 4 and must not crowd a four-item list.
    await upsertEmbedding(payload, me.id, unit(20), EMBEDDING_MODEL, 'h')
    await upsertEmbedding(payload, near.id, mix(20, 21, 5, 1), EMBEDDING_MODEL, 'h') // very close
    await upsertEmbedding(payload, draft.id, unit(20), EMBEDDING_MODEL, 'h') // the closest of all, but a draft
    await upsertEmbedding(payload, far.id, unit(21), EMBEDDING_MODEL, 'h') // unrelated
    for (const [i, e] of ep.entries()) await upsertEmbedding(payload, e.id, mix(20, 21, 3 + i, 1), EMBEDDING_MODEL, 'h')

    const related = await loadRelatedStories(me)
    const ids = related.map((r) => r.id)
    expect(ids).toContain(near.id)
    expect(ids).not.toContain(draft.id) // never offered: not public
    expect(ids).not.toContain(far.id) // below the floor
    expect(ids).not.toContain(me.id)
    expect(ids.filter((id) => ep.some((e) => e.id === id))).toHaveLength(2) // the series cap
    expect(related.every((r) => typeof r.path === 'string' && r.path.length > 0)).toBe(true)
  })

  it('is empty, not an error, for a story with no vector', async () => {
    const bare = await story('Related bare')
    expect(await loadRelatedStories(bare)).toEqual([])
  })
})

describe('semantic search', () => {
  it('is off without the Site settings switch, even with a key, and sends nothing', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    mocks.embed.mockClear()
    expect(await semanticStories('flood', { settingOn: false })).toEqual([])
    expect(await semanticStories('flood', { settingOn: undefined })).toEqual([])
    expect(mocks.embed).not.toHaveBeenCalled()
  })

  it('is off without a key, even with the switch on, and sends nothing', async () => {
    delete process.env.OPENAI_API_KEY
    mocks.embed.mockClear()
    expect(await semanticStories('flood', { settingOn: true })).toEqual([])
    expect(mocks.embed).not.toHaveBeenCalled()
  })

  it('finds published stories by meaning, above the floor, and honours the kind filter', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    const flood = await story('Searchable flood coverage')
    const music = await story('Searchable music coverage')
    const draft = await story('Searchable flood draft', { _status: 'draft' })
    const episode = await story('Searchable flood episode', { format: 'audio', production: (await payload.create({ collection: 'productions', data: { title: `Search show ${run}` } as never, overrideAccess: true, context: ctx }).then((p) => { created.push({ collection: 'productions', id: p.id as number }); return p.id })) })
    for (const s of [flood, music, draft, episode]) await upsertEmbedding(payload, s.id, textToVector(s.title), EMBEDDING_MODEL, 'h')

    const hits = await semanticStories('flood', { settingOn: true, limit: 50 })
    const paths = hits.map((h) => h.id)
    expect(paths).toContain(`semantic-${flood.id}`)
    expect(paths).toContain(`semantic-${episode.id}`)
    expect(paths).not.toContain(`semantic-${music.id}`) // unrelated: under the floor
    expect(paths).not.toContain(`semantic-${draft.id}`) // not public
    expect(hits.find((h) => h.id === `semantic-${episode.id}`)?.kind).toBe('episode')
    expect(hits.find((h) => h.id === `semantic-${flood.id}`)?.kind).toBe('story')

    const onlyStories = await semanticStories('flood', { settingOn: true, kinds: ['story'], limit: 50 })
    expect(onlyStories.map((h) => h.id)).toContain(`semantic-${flood.id}`)
    expect(onlyStories.map((h) => h.id)).not.toContain(`semantic-${episode.id}`)
  })

  it('answers with nothing, not an error, when the provider fails', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    mocks.embed.mockRejectedValueOnce(new Error('provider down'))
    expect(await semanticStories('a query never asked before', { settingOn: true })).toEqual([])
  })
})
