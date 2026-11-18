// @vitest-environment node
import { getPayload, type Payload, type PayloadRequest } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from '@/lib/embeddings/config'
import { EMBED_BATCH, embedNextBatch, neighbourExamples } from '@/lib/embeddings/admin'
import { embeddingCoverage, missingPostIds, storedEmbeddings, upsertEmbedding } from '@/lib/embeddings/store'
import { resolveTuning } from '@/lib/embeddings/tuning'
import { storyEmbeddingEndpoints } from '@/globals/storyEmbeddingEndpoints'

// The admin panel's server side against a real pgvector database: coverage and the next stories to embed, a batch (only WUWF's own
// published stories, nothing already current, a provider failure reported not thrown), the examples under the tuning numbers, and who may
// call the endpoints. The provider is a fake; nothing leaves the machine.

const TOPICS = ['flood', 'music']
const unit = (axis: number): number[] => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === axis ? 1 : 0))
const mix = (a: number, b: number, wa: number, wb: number): number[] => {
  const n = Math.hypot(wa, wb)
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === a ? wa / n : i === b ? wb / n : 0))
}
function textToVector(text: string): number[] {
  const lower = text.toLowerCase()
  const axes = TOPICS.flatMap((t, i) => (lower.includes(t) ? [i] : []))
  const v = Array<number>(EMBEDDING_DIMENSIONS).fill(0)
  for (const a of axes.length ? axes : [10]) v[a] = 1
  const norm = Math.hypot(...v)
  return v.map((x) => x / norm)
}

const mocks = vi.hoisted(() => ({ embed: vi.fn(), key: { present: true } }))
vi.mock('@/lib/embeddings/service', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/embeddings/service')>()
  const fake = { model: 'text-embedding-3-small', dimensions: 1536, embed: mocks.embed }
  return { ...original, getEmbeddingProvider: () => (mocks.key.present ? fake : null) }
})
mocks.embed.mockImplementation(async (inputs: string[]) => inputs.map(textToVector))

const run = Date.now().toString(36)
let payload: Payload
let section: number | string
const created: number[] = []
const ctx = { disableRevalidate: true, disableEmbedding: true }
const para = (text: string) => ({ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text, format: 0, mode: 'normal', style: '', detail: 0 }] })
const body = (text: string) => ({ root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [para(text)] } })

async function story(title: string, data: Record<string, unknown> = {}) {
  const doc = (await payload.create({
    collection: 'posts',
    overrideAccess: true,
    context: { ...ctx },
    data: { title: `${title} ${run}`, content: body(title), _status: 'published', section, publishedAt: '2090-01-02T12:00:00.000Z', ...data } as never,
  })) as unknown as { id: number; title: string }
  created.push(doc.id)
  return doc
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  const { ensureTestSection } = await import('../helpers/section')
  section = await ensureTestSection(payload)
}, 90_000)

afterAll(async () => {
  for (const id of [...created].reverse()) await payload.delete({ collection: 'posts', id, overrideAccess: true, context: ctx }).catch(() => undefined)
})

describe('coverage and the next stories to embed', () => {
  it('counts a published WUWF story as waiting until it has a vector, and skips NPR stories and drafts', async () => {
    const before = await embeddingCoverage(payload)
    const mine = await story('Coverage flood')
    await story('Coverage NPR flood', { source: 'npr' })
    await story('Coverage draft flood', { _status: 'draft' })
    const after = await embeddingCoverage(payload)
    expect(after.eligible).toBe(before.eligible + 1)
    expect(after.embedded).toBe(before.embedded)

    expect(await missingPostIds(payload, mine.id - 1, 5)).toContain(mine.id)
    await upsertEmbedding(payload, mine.id, unit(0), EMBEDDING_MODEL, 'h')
    expect(await missingPostIds(payload, mine.id - 1, 500)).not.toContain(mine.id)
    expect((await embeddingCoverage(payload)).embedded).toBe(before.embedded + 1)
  })

  it('moves past the cursor, in id order', async () => {
    const a = await story('Cursor A flood')
    const b = await story('Cursor B flood')
    const ids = await missingPostIds(payload, a.id - 1, 500)
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id))
    expect(await missingPostIds(payload, a.id, 500)).not.toContain(a.id)
  })
})

describe('embedNextBatch', () => {
  it('embeds waiting WUWF stories, leaves NPR stories and drafts alone, and then has nothing left to do', async () => {
    mocks.key.present = true
    const first = await story('Batch one flood')
    const npr = await story('Batch NPR music', { source: 'npr' })
    const draft = await story('Batch draft music', { _status: 'draft' })
    const second = await story('Batch two music')

    let after = first.id - 1
    for (let i = 0; i < 50; i++) {
      const result = await embedNextBatch(payload, after)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      after = result.lastId
      if (result.done) break
    }
    const stored = await storedEmbeddings(payload, [first.id, second.id, npr.id, draft.id])
    expect(stored.has(first.id)).toBe(true)
    expect(stored.has(second.id)).toBe(true)
    expect(stored.has(npr.id)).toBe(false)
    expect(stored.has(draft.id)).toBe(false)

    // Nothing left after the last story: a second run sends nothing.
    mocks.embed.mockClear()
    const again = await embedNextBatch(payload, first.id - 1)
    expect(again.ok && again.embedded).toBe(0)
    expect(mocks.embed).not.toHaveBeenCalled()
  })

  it('does not touch a story that already has a current vector', async () => {
    const s = await story('Current flood')
    await embedNextBatch(payload, s.id - 1)
    mocks.embed.mockClear()
    await embedNextBatch(payload, s.id - 1)
    expect(mocks.embed).not.toHaveBeenCalled()
  })

  it('takes at most one batch of stories per request', async () => {
    const first = await story('Cap 0 flood')
    for (let i = 1; i <= EMBED_BATCH + 2; i++) await story(`Cap ${i} flood`)
    mocks.embed.mockClear()
    const result = await embedNextBatch(payload, first.id - 1)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.embedded).toBeLessThanOrEqual(EMBED_BATCH)
      expect(result.done).toBe(false)
    }
    const inputs = mocks.embed.mock.calls.flatMap((c) => c[0] as string[])
    expect(inputs.length).toBeLessThanOrEqual(EMBED_BATCH)
  })

  it('says so, and sends nothing, when the server has no key', async () => {
    mocks.key.present = false
    mocks.embed.mockClear()
    const s = await story('No key flood')
    const result = await embedNextBatch(payload, s.id - 1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/OPENAI_API_KEY/)
    expect(mocks.embed).not.toHaveBeenCalled()
    mocks.key.present = true
  })

  it('reports a provider failure instead of throwing, and keeps the cursor usable', async () => {
    const s = await story('Fails flood')
    mocks.embed.mockRejectedValueOnce(new Error('Embedding request failed (HTTP 401)'))
    const result = await embedNextBatch(payload, s.id - 1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/401/)
    // Still waiting, so a retry after the key is fixed picks it up.
    expect(await missingPostIds(payload, s.id - 1, 5)).toContain(s.id)
  })
})

describe('neighbourExamples', () => {
  it('marks a neighbour shown or not shown by the numbers given, using what a story page would use', async () => {
    const me = await story('Example me')
    const near = await story('Example near')
    const far = await story('Example far')
    // Axes 40 and 41 belong to this test alone, so no other story in the file crowds these three out of each other's nearest eight.
    await upsertEmbedding(payload, me.id, unit(40), EMBEDDING_MODEL, 'h-me')
    await upsertEmbedding(payload, near.id, mix(40, 41, 3, 1), EMBEDDING_MODEL, 'h-near') // cosine about 0.95
    await upsertEmbedding(payload, far.id, mix(40, 41, 1, 3), EMBEDDING_MODEL, 'h-far') // cosine about 0.32

    const find = async (tuning: ReturnType<typeof resolveTuning>) => {
      const all = await neighbourExamples(payload, tuning, 1000)
      return all.find((e) => e.title === me.title)?.neighbours ?? []
    }
    const loose = await find(resolveTuning({ relatedMinSimilarity: 0.1 }))
    expect(loose.find((n) => n.title === near.title)?.shown).toBe(true)
    expect(loose.find((n) => n.title === far.title)?.shown).toBe(true)

    const strict = await find(resolveTuning({ relatedMinSimilarity: 0.5 }))
    expect(strict.find((n) => n.title === near.title)?.shown).toBe(true)
    const farRow = strict.find((n) => n.title === far.title)
    expect(farRow?.shown).toBe(false)
    expect(farRow?.similarity).toBeGreaterThan(0.3)
    expect(farRow?.similarity).toBeLessThan(0.35)
  })

  it('leaves out a story the public cannot read', async () => {
    const hidden = await story('Example hidden')
    await upsertEmbedding(payload, hidden.id, unit(5), EMBEDDING_MODEL, 'h-hidden')
    await payload.update({ collection: 'posts', id: hidden.id, overrideAccess: true, context: ctx, data: { _status: 'draft' } as never })
    const all = await neighbourExamples(payload, resolveTuning({}), 1000)
    expect(all.some((e) => e.title === hidden.title)).toBe(false)
  })
})

describe('who may use the endpoints', () => {
  const handlerFor = (path: string, method: string) => storyEmbeddingEndpoints.find((e) => e.path === path && e.method === method)!.handler
  const req = (user: unknown, url = 'http://localhost/api/globals/site-settings/embeddings') => ({ user, payload, url }) as unknown as PayloadRequest

  it('refuses a request with no signed-in user', async () => {
    for (const [path, method] of [['/embeddings', 'get'], ['/embeddings/run', 'post'], ['/embeddings/examples', 'get']]) {
      expect((await handlerFor(path, method)(req(null))).status).toBe(401)
    }
  })

  it('refuses staff without the settings permission: an editor or a publisher cannot spend the provider key', async () => {
    for (const roles of [['editor'], ['publisher'], ['sponsorship'], []]) {
      mocks.embed.mockClear()
      expect((await handlerFor('/embeddings', 'get')(req({ roles }))).status).toBe(403)
      expect((await handlerFor('/embeddings/run', 'post')(req({ roles }))).status).toBe(403)
      expect((await handlerFor('/embeddings/examples', 'get')(req({ roles }))).status).toBe(403)
      expect(mocks.embed).not.toHaveBeenCalled()
    }
  })

  it('lets an administrator read the status, and never returns a key, a vector or a story text', async () => {
    const response = await handlerFor('/embeddings', 'get')(req({ roles: ['administrator'] }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Object.keys(body).sort()).toEqual(['eligible', 'embedded', 'keySet', 'waiting'])
    expect(typeof body.keySet).toBe('boolean')
  })

  it('reads the cursor and the form numbers from the address, ignoring anything that is not a number', async () => {
    const admin = { roles: ['administrator'] }
    const s = await story('Cursor address flood')
    const result = await handlerFor('/embeddings/run', 'post')(req(admin, `http://localhost/x?after=${s.id - 1}`))
    expect(result.status).toBe(200)
    expect((await result.json()).ok).toBe(true)
    const examples = await handlerFor('/embeddings/examples', 'get')(req(admin, 'http://localhost/x?related=abc&perSeries='))
    expect(examples.status).toBe(200)
  })
})
