import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Payload does not apply a block's own access rule to a block inside rich text, so the two restricted blocks (preserved HTML:
// administrators only; script widget: publishers only) are enforced by a collection hook. That hook must be on EVERY collection
// with a rich-text body, not only stories: this test walks them all.

const run = Date.now().toString(36)
let payload: Payload
const created: { collection: string; id: string | number }[] = []
const ctx = { disableRevalidate: true }
const editor = { id: 1, collection: 'users', email: 'e@wuwf.org', roles: ['editor'] }
const publisher = { id: 2, collection: 'users', email: 'p@wuwf.org', roles: ['editor', 'publisher'] }
const admin = { id: 3, collection: 'users', email: 'a@wuwf.org', roles: ['administrator'] }

const text = (t: string) => ({ type: 'text', version: 1, text: t, format: 0, mode: 'normal', style: '', detail: 0 })
const para = (t: string) => ({ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [text(t)] })
const block = (blockType: string, fields: Record<string, unknown>, id: string) => ({ type: 'block', version: 2, format: '', fields: { id, blockType, ...fields } })
const doc = (...children: unknown[]) => ({ root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children } })
const widget = (id = 'w1', scriptUrl = 'https://static.electup.com/v2/app.js') => block('widget', { title: 'Guide', scriptUrl, module: true, elementId: 'g', attributes: [], height: 600 }, id)
const legacy = (id = 'l1', html = '<p>Old</p>') => block('legacyHtml', { html, note: 'x' }, id)

async function make<T extends { id: string | number }>(collection: string, data: Record<string, unknown>): Promise<T> {
  const d = (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx })) as unknown as T
  created.push({ collection, id: d.id })
  return d
}
const asUser = (user: unknown) => ({ user: user as never, overrideAccess: false, context: ctx })

/** One place per collection that takes story-style content: how to create a record holding `content`, and how to change it later. */
const places = [
  {
    name: 'a live update',
    create: async (user: unknown, content: unknown, blogId: string | number) =>
      payload.create({ collection: 'live-updates', data: { livePost: blogId, headline: `U ${run}`, body: content } as never, ...asUser(user) }),
    update: (id: string | number, user: unknown, content: unknown) => payload.update({ collection: 'live-updates', id, data: { body: content } as never, ...asUser(user) }),
    plain: (blogId: string | number) => ({ livePost: blogId, headline: `Seed ${run}` }),
    collection: 'live-updates',
    field: 'body',
  },
  {
    name: 'a live blog introduction',
    create: async (user: unknown, content: unknown) => payload.create({ collection: 'live-posts', draft: true, data: { title: `B ${run}`, intro: content, _status: 'draft' } as never, ...asUser(user) }),
    update: (id: string | number, user: unknown, content: unknown) => payload.update({ collection: 'live-posts', id, draft: true, data: { intro: content, _status: 'draft' } as never, ...asUser(user) }),
    plain: () => ({ title: `Seed blog ${run}`, _status: 'draft' }),
    collection: 'live-posts',
    field: 'intro',
  },
  {
    name: 'a page body',
    create: async (user: unknown, content: unknown) => payload.create({ collection: 'pages', draft: true, data: { title: `P ${run}`, body: content, _status: 'draft' } as never, ...asUser(user) }),
    update: (id: string | number, user: unknown, content: unknown) => payload.update({ collection: 'pages', id, draft: true, data: { body: content, _status: 'draft' } as never, ...asUser(user) }),
    plain: () => ({ title: `Seed page ${run}`, _status: 'draft' }),
    collection: 'pages',
    field: 'body',
  },
  {
    name: 'a show description',
    create: async (user: unknown, content: unknown) => payload.create({ collection: 'productions', data: { title: `S ${run}`, description: content } as never, ...asUser(user) }),
    update: (id: string | number, user: unknown, content: unknown) => payload.update({ collection: 'productions', id, data: { description: content } as never, ...asUser(user) }),
    plain: () => ({ title: `Seed show ${run}` }),
    collection: 'productions',
    field: 'description',
  },
  {
    name: 'a story body',
    create: async (user: unknown, content: unknown) => payload.create({ collection: 'posts', draft: true, data: { title: `St ${run}`, content, _status: 'draft' } as never, ...asUser(user) }),
    update: (id: string | number, user: unknown, content: unknown) => payload.update({ collection: 'posts', id, draft: true, data: { content, _status: 'draft' } as never, ...asUser(user) }),
    plain: () => ({ title: `Seed story ${run}`, content: doc(para('x')), _status: 'draft' }),
    collection: 'posts',
    field: 'content',
  },
] as const

describe('restricted blocks are refused on every collection that takes story-style content', () => {
  let blog: { id: string | number }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    blog = await make('live-posts', { title: `Host blog ${run}`, _status: 'published' })
  }, 60_000)

  afterAll(async () => {
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  const track = (collection: string, d: { id: string | number }) => created.push({ collection, id: d.id })

  for (const place of places) {
    describe(place.name, () => {
      it('an editor cannot add a script widget or preserved HTML', async () => {
        await expect(place.create(editor, doc(para('x'), widget()), blog.id)).rejects.toThrow(/publisher/i)
        await expect(place.create(editor, doc(para('x'), legacy()), blog.id)).rejects.toThrow(/administrator/i)
      })

      it('a publisher can add a widget but not preserved HTML; an administrator can add preserved HTML', async () => {
        const w = await place.create(publisher, doc(para('x'), widget()), blog.id)
        track(place.collection, w)
        await expect(place.create(publisher, doc(para('x'), legacy()), blog.id)).rejects.toThrow(/administrator/i)
        const l = await place.create(admin, doc(para('x'), legacy()), blog.id)
        track(place.collection, l)
      })

      it('an editor cannot add one to a record that already exists, but can keep what is already there', async () => {
        const seed = await make<{ id: string | number }>(place.collection, { ...place.plain(blog.id), [place.field]: doc(para('start'), widget('keep'), legacy('keep2')) })
        // re-saving the same content, with new text elsewhere, is fine
        await expect(place.update(seed.id, editor, doc(para('edited'), widget('keep'), legacy('keep2')))).resolves.toBeTruthy()
        // changing the script, or adding a second widget, is not
        await expect(place.update(seed.id, editor, doc(para('x'), widget('keep', 'https://evil.example.org/x.js'), legacy('keep2')))).rejects.toThrow(/publisher/i)
        await expect(place.update(seed.id, editor, doc(para('x'), widget('keep'), widget('new'), legacy('keep2')))).rejects.toThrow(/publisher/i)
        await expect(place.update(seed.id, editor, doc(para('x'), widget('keep'), legacy('keep2', '<p>Changed</p>')))).rejects.toThrow(/administrator/i)
      })
    })
  }
})
