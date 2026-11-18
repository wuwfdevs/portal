// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { sitemapStories } from '@/lib/seo/sitemap-where'

// The network collections against a real database: who may create and change what, the status rules, the unique CDS id, the original
// address on posts, deleting a source, and that the sitemap leaves out another publisher's story.

type Doc = { id: number; [key: string]: unknown }

const run = Date.now().toString(36)
let payload: Payload
let section: number | string
const cleanup: { collection: string; id: number | string }[] = []
const ctx = { disableRevalidate: true, disableEmbedding: true }
const system = { ...ctx, networkSystem: true }

// The first user in an empty table is the break-glass administrator, so acting users carry explicit roles (as in the other suites).
const editor = { id: 910001, collection: 'users', email: `ed-${run}@example.org`, roles: ['editor'] } as never
const publisher = { id: 910002, collection: 'users', email: `pub-${run}@example.org`, roles: ['publisher'] } as never

async function rejectsWith(promise: Promise<unknown>, reason: RegExp): Promise<void> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e as { message: string; data?: { errors?: { message: string }[] } },
  )
  expect(err, 'expected the call to be refused').not.toBeNull()
  expect([err!.message, ...(err!.data?.errors ?? []).map((e) => e.message)].join(' | ')).toMatch(reason)
}

async function source(data: Record<string, unknown> = {}): Promise<Doc> {
  const doc = (await payload.create({ collection: 'network-sources', overrideAccess: true, context: ctx, data: { name: `WLRN ${run}`, findBy: 'owner', serviceId: 's583', ...data } as never })) as unknown as Doc
  cleanup.push({ collection: 'network-sources', id: doc.id })
  return doc
}

async function item(sourceId: number, n: number, data: Record<string, unknown> = {}): Promise<Doc> {
  const doc = (await payload.create({
    collection: 'network-items',
    overrideAccess: true,
    context: system,
    data: { title: `Story ${n} ${run}`, source: sourceId, cdsId: `cds-${run}-${n}`, status: 'new', teaser: 'A teaser', ...data } as never,
  })) as unknown as Doc
  cleanup.push({ collection: 'network-items', id: doc.id })
  return doc
}

const para = (text: string) => ({ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text, format: 0, mode: 'normal', style: '', detail: 0 }] })
const body = (text: string) => ({ root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [para(text)] } })

async function post(title: string, data: Record<string, unknown> = {}): Promise<Doc> {
  const doc = (await payload.create({
    collection: 'posts',
    overrideAccess: true,
    context: ctx,
    data: { title: `${title} ${run}`, content: body(title), _status: 'published', section, publishedAt: '2090-01-02T12:00:00.000Z', ...data } as never,
  })) as unknown as Doc
  cleanup.push({ collection: 'posts', id: doc.id })
  return doc
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  const { ensureTestSection } = await import('../helpers/section')
  section = await ensureTestSection(payload)
}, 90_000)

afterAll(async () => {
  for (const c of [...cleanup].reverse()) await payload.delete({ collection: c.collection as never, id: c.id, overrideAccess: true, context: system }).catch(() => undefined)
})

describe('network sources', () => {
  it('needs a real service id for an owner and a positive whole number for a collection', async () => {
    await rejectsWith(source({ serviceId: '583' }), /s followed by digits/)
    await rejectsWith(source({ serviceId: 's583&limit=9999' }), /s followed by digits/)
    await rejectsWith(source({ findBy: 'collection', serviceId: undefined, collectionId: 0 }), /positive whole number/)
    const ok = await source({ findBy: 'collection', serviceId: undefined, collectionId: 1003, name: `NPR News ${run}` })
    expect(ok.collectionId).toBe(1003)
  })

  it('queues by default, so nothing publishes on its own until a publisher says so', async () => {
    expect((await source()).mode).toBe('queue')
  })

  it('may be changed only by a publisher; an editor can read them', async () => {
    const s = await source()
    await rejectsWith(payload.update({ collection: 'network-sources', id: s.id, data: { mode: 'auto' } as never, user: editor, overrideAccess: false, context: ctx }), /not allowed/i)
    const changed = (await payload.update({ collection: 'network-sources', id: s.id, data: { mode: 'auto' } as never, user: publisher, overrideAccess: false, context: ctx })) as unknown as Doc
    expect(changed.mode).toBe('auto')
    const read = await payload.findByID({ collection: 'network-sources', id: s.id, user: editor, overrideAccess: false })
    expect(read.id).toBe(s.id)
  })

  it('cannot be read by the public', async () => {
    const s = await source()
    await rejectsWith(payload.findByID({ collection: 'network-sources', id: s.id, overrideAccess: false }), /not allowed|not found/i)
  })

  it('takes its candidate stories with it when deleted, and leaves published posts alone', async () => {
    const s = await source({ name: `Doomed ${run}` })
    const it1 = await item(s.id, 1)
    const p = await post('Kept story')
    await payload.update({ collection: 'network-items', id: it1.id, data: { status: 'published', post: p.id } as never, overrideAccess: true, context: system })
    await payload.delete({ collection: 'network-sources', id: s.id, overrideAccess: true, context: ctx })
    const items = await payload.find({ collection: 'network-items', where: { id: { equals: it1.id } }, overrideAccess: true })
    expect(items.totalDocs).toBe(0)
    const stillThere = await payload.findByID({ collection: 'posts', id: p.id, overrideAccess: true })
    expect(stillThere.id).toBe(p.id)
  })
})

describe('network stories', () => {
  let s: Doc
  beforeAll(async () => {
    s = await source({ name: `Items ${run}` })
  })

  it('are created only by the poll: no staff account can make one', async () => {
    await rejectsWith(
      payload.create({ collection: 'network-items', data: { title: 'Made by hand', source: s.id, cdsId: `hand-${run}` } as never, user: publisher, overrideAccess: false, context: ctx }),
      /not allowed/i,
    )
  })

  it('keep one row for one CDS id', async () => {
    await item(s.id, 10)
    await rejectsWith(item(s.id, 10), /unique|already|duplicate/i)
  })

  it('may be kept, released and dismissed by an editor', async () => {
    const x = await item(s.id, 20)
    const move = (status: string) => payload.update({ collection: 'network-items', id: x.id, data: { status } as never, user: editor, overrideAccess: false, context: ctx })
    expect(((await move('held')) as unknown as Doc).status).toBe('held')
    expect(((await move('new')) as unknown as Doc).status).toBe('new')
    expect(((await move('dismissed')) as unknown as Doc).status).toBe('dismissed')
  })

  it('cannot be marked published or gone by hand, and a dismissed one stays dismissed', async () => {
    const x = await item(s.id, 21)
    const move = (status: string) => payload.update({ collection: 'network-items', id: x.id, data: { status } as never, user: editor, overrideAccess: false, context: ctx })
    await rejectsWith(move('published'), /cannot be set to "published" by hand/)
    await rejectsWith(move('gone'), /cannot be set to "gone" by hand/)
    await move('dismissed')
    await rejectsWith(move('new'), /cannot be set to "new" by hand/)
  })

  it('may be marked published or gone by the system', async () => {
    const x = await item(s.id, 22)
    const out = (await payload.update({ collection: 'network-items', id: x.id, data: { status: 'gone' } as never, overrideAccess: true, context: system })) as unknown as Doc
    expect(out.status).toBe('gone')
  })

  it('cannot have their content edited by staff: the title stays what the source said', async () => {
    const x = await item(s.id, 23, { title: `Original title ${run}` })
    await payload.update({ collection: 'network-items', id: x.id, data: { title: 'Rewritten', status: 'held' } as never, user: editor, overrideAccess: false, context: ctx })
    const after = await payload.findByID({ collection: 'network-items', id: x.id, overrideAccess: true })
    expect(after.title).toBe(`Original title ${run}`)
    expect(after.status).toBe('held')
  })

  it('are not readable by the public', async () => {
    const x = await item(s.id, 24)
    await rejectsWith(payload.findByID({ collection: 'network-items', id: x.id, overrideAccess: false }), /not allowed|not found/i)
  })
})

describe('the original address on a post', () => {
  it('keeps where the original lives, who gets the credit and the CDS id', async () => {
    const p = await post('Wire story', { source: 'wire', original: { url: 'https://station.example.org/a', credit: 'WLRN', cdsId: `cds-post-${run}-1` } })
    const read = await payload.findByID({ collection: 'posts', id: p.id, overrideAccess: true })
    expect(read.original).toMatchObject({ url: 'https://station.example.org/a', credit: 'WLRN', cdsId: `cds-post-${run}-1` })
  })

  it('refuses an address that is not https', async () => {
    await rejectsWith(post('Bad address', { source: 'wire', original: { url: 'http://station.example.org/a' } }), /https/)
    await rejectsWith(post('Script address', { source: 'wire', original: { url: 'javascript:alert(1)' } }), /https/)
  })

  it('never lets two posts claim one CDS document', async () => {
    await post('First copy', { source: 'wire', original: { cdsId: `cds-post-${run}-2` } })
    await rejectsWith(post('Second copy', { source: 'wire', original: { cdsId: `cds-post-${run}-2` } }), /unique|already|duplicate/i)
  })
})

describe('the sitemap', () => {
  it('lists WUWF\'s own published stories and leaves out another publisher\'s', async () => {
    const own = await post('Own story', { source: 'wuwf' })
    const wire = await post('Wire copy', { source: 'wire', original: { url: 'https://station.example.org/w' } })
    const npr = await post('NPR copy', { source: 'npr' })
    const listed = await payload.find({ collection: 'posts', overrideAccess: true, depth: 0, limit: 500, where: { and: [sitemapStories, { id: { in: [own.id, wire.id, npr.id] } }] } })
    expect(listed.docs.map((d) => d.id)).toEqual([own.id])
  })
})
