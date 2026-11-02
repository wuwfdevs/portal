import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureTestSection } from '../helpers/section'

// Roles must mean something on the editorial collections: only content staff change stories and pages, only a
// publisher makes work live, and the public (and an archive block) never see a draft.

const run = Date.now().toString(36)
let payload: Payload
const created: { collection: 'posts' | 'pages' | 'categories'; id: number | string }[] = []

const as = (role: string) => ({ id: 1, collection: 'users', email: `${role}@wuwf.org`, roles: [role] }) as never
const editor = as('editor')
const publisher = as('publisher')
const sponsorship = as('sponsorship')
const membership = as('membership')
const admin = as('administrator')

const lexical = {
  root: {
    type: 'root', version: 1, direction: 'ltr', format: '', indent: 0,
    children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: 'Body.', format: 0, mode: 'normal', style: '', detail: 0 }] }],
  },
}
const asUser = (user: unknown) => ({ overrideAccess: false, user: user as never, context: { disableRevalidate: true } })

async function makePost(title: string, status: 'draft' | 'published', topic?: number | string) {
  const p = await payload.create({
    collection: 'posts',
    draft: status === 'draft',
    overrideAccess: true,
    context: { disableRevalidate: true },
    data: { title: `${title} ${run}`, content: lexical, _status: status, section: await ensureTestSection(payload), ...(topic ? { categories: [topic] } : {}) } as never,
  })
  created.push({ collection: 'posts', id: p.id })
  return p
}

describe('editorial permissions', () => {
  let topicId: number | string
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const topic = await payload.create({ collection: 'categories', overrideAccess: true, context: { disableRevalidate: true }, data: { title: `Access topic ${run}` } as never })
    topicId = topic.id
    created.push({ collection: 'categories', id: topic.id })
  }, 60_000)
  afterAll(async () => {
    for (const { collection, id } of created.reverse())
      await payload.delete({ collection, id, overrideAccess: true, context: { disableRevalidate: true } }).catch(() => undefined)
  })

  describe('posts', () => {
    it.each([['sponsorship', sponsorship], ['membership', membership]])('%s staff cannot create, edit or delete a story', async (_n, user) => {
      const live = await makePost('Untouchable', 'published')
      await expect(payload.create({ collection: 'posts', ...asUser(user), draft: true, data: { title: `x ${run}`, content: lexical } as never })).rejects.toThrow()
      await expect(payload.update({ collection: 'posts', id: live.id, ...asUser(user), data: { title: `hijacked ${run}` } as never })).rejects.toThrow()
      await expect(payload.delete({ collection: 'posts', id: live.id, ...asUser(user) })).rejects.toThrow()
      const after = await payload.findByID({ collection: 'posts', id: live.id, overrideAccess: true })
      expect(after.title).toBe(`Untouchable ${run}`)
    })

    it('an editor can write drafts but cannot publish', async () => {
      const draft = await payload.create({ collection: 'posts', ...asUser(editor), draft: true, data: { title: `Editor draft ${run}`, content: lexical } as never })
      created.push({ collection: 'posts', id: draft.id })
      expect(draft._status).toBe('draft')
      await payload.update({ collection: 'posts', id: draft.id, ...asUser(editor), draft: true, data: { title: `Editor draft v2 ${run}` } as never })

      await expect(payload.create({ collection: 'posts', ...asUser(editor), data: { title: `Editor live ${run}`, content: lexical, _status: 'published' } as never })).rejects.toThrow(/publisher/)
      await expect(payload.update({ collection: 'posts', id: draft.id, ...asUser(editor), data: { _status: 'published' } as never })).rejects.toThrow(/publisher/)
      const still = await payload.findByID({ collection: 'posts', id: draft.id, overrideAccess: true, draft: false })
      expect(still._status).toBe('draft')
    })

    it('an editor cannot change a live story directly, but can save a draft of it', async () => {
      const live = await makePost('Live story', 'published')
      await expect(payload.update({ collection: 'posts', id: live.id, ...asUser(editor), data: { title: `Edited live ${run}` } as never })).rejects.toThrow(/publisher/)
      await payload.update({ collection: 'posts', id: live.id, ...asUser(editor), draft: true, data: { title: `Draft of live ${run}` } as never })
      const publicCopy = await payload.findByID({ collection: 'posts', id: live.id, overrideAccess: true, draft: false })
      expect(publicCopy.title).toBe(`Live story ${run}`)
    })

    it('an editor cannot delete; a publisher and an administrator can publish and delete', async () => {
      const draft = await makePost('To delete', 'draft')
      await expect(payload.delete({ collection: 'posts', id: draft.id, ...asUser(editor) })).rejects.toThrow()
      for (const user of [publisher, admin]) {
        const p = await payload.create({ collection: 'posts', ...asUser(user), data: { title: `Published by role ${run}`, content: lexical, _status: 'published', section: await ensureTestSection(payload) } as never })
        expect(p._status).toBe('published')
        await payload.delete({ collection: 'posts', id: p.id, ...asUser(user) })
      }
    })

    it('reads: the public and non-content staff see published stories only; editors see drafts', async () => {
      const draft = await makePost('Hidden draft', 'draft')
      const live = await makePost('Shown story', 'published')
      const ids = async (user?: unknown) =>
        (await payload.find({ collection: 'posts', limit: 200, depth: 0, pagination: false, overrideAccess: false, ...(user ? { user: user as never } : {}), where: { title: { like: `${run}` } } })).docs.map((d) => d.id)
      expect(await ids()).toEqual(expect.arrayContaining([live.id]))
      expect(await ids()).not.toContain(draft.id)
      expect(await ids(sponsorship)).not.toContain(draft.id)
      expect(await ids(editor)).toEqual(expect.arrayContaining([draft.id, live.id]))
    })

    it('an archive-style query as the public (overrideAccess: false) never returns a draft', async () => {
      const draft = await makePost('Archive draft', 'draft', topicId)
      const live = await makePost('Archive live', 'published', topicId)
      const archive = await payload.find({ collection: 'posts', depth: 1, limit: 12, overrideAccess: false, where: { categories: { in: [topicId] } } })
      expect(archive.docs.map((d) => d.id)).toEqual([live.id])
      const unguarded = await payload.find({ collection: 'posts', depth: 1, limit: 12, where: { categories: { in: [topicId] } } })
      expect(unguarded.docs.map((d) => d.id)).toContain(draft.id) // the default the block had: why the flag matters
    })
  })

  describe('pages', () => {
    const pageData = (title: string, status: 'draft' | 'published') =>
      ({ title: `${title} ${run}`, _status: status, hero: { type: 'none' }, layout: [{ blockType: 'content', columns: [{ size: 'full', richText: lexical }] }] }) as never

    it('sponsorship staff cannot create pages; editors cannot publish them; publishers can', async () => {
      await expect(payload.create({ collection: 'pages', ...asUser(sponsorship), draft: true, data: pageData('Nope', 'draft') })).rejects.toThrow()
      await expect(payload.create({ collection: 'pages', ...asUser(editor), data: pageData('Editor live page', 'published') })).rejects.toThrow(/publisher/)
      const draft = await payload.create({ collection: 'pages', ...asUser(editor), draft: true, data: pageData('Editor draft page', 'draft') })
      created.push({ collection: 'pages', id: draft.id })
      const live = await payload.create({ collection: 'pages', ...asUser(publisher), data: pageData('Publisher page', 'published') })
      created.push({ collection: 'pages', id: live.id })
      expect(live._status).toBe('published')
      await expect(payload.delete({ collection: 'pages', id: live.id, ...asUser(editor) })).rejects.toThrow()
    })
  })

  describe('redirects and forms', () => {
    it('only a publisher can create a redirect; only content staff can create a form', async () => {
      const redirect = { from: `/old-${run}`, to: { type: 'custom', url: 'https://www.wuwf.org/' } } as never
      await expect(payload.create({ collection: 'redirects', ...asUser(sponsorship), data: redirect })).rejects.toThrow()
      await expect(payload.create({ collection: 'redirects', ...asUser(editor), data: redirect })).rejects.toThrow()
      const made = await payload.create({ collection: 'redirects', ...asUser(publisher), data: redirect })
      await payload.delete({ collection: 'redirects', id: made.id, overrideAccess: true, context: { disableRevalidate: true } })
      await expect(payload.create({ collection: 'forms', ...asUser(membership), data: { title: `Nope ${run}` } as never })).rejects.toThrow()
    })
  })

  describe('topics and media', () => {
    it('sponsorship staff cannot create or delete topics', async () => {
      await expect(payload.create({ collection: 'categories', ...asUser(sponsorship), data: { title: `Nope ${run}` } as never })).rejects.toThrow()
      await expect(payload.delete({ collection: 'categories', id: topicId, ...asUser(membership) })).rejects.toThrow()
      await expect(payload.create({ collection: 'categories', ...asUser(editor), data: { title: `Editor topic ${run}` } as never }).then((c) => { created.push({ collection: 'categories', id: c.id }); return c })).resolves.toBeDefined()
    })
  })
})
