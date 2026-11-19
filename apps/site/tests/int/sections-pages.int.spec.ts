import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Pages built from sections (PAGE-BLOCKS.md, phase 1): the template saves and publishes its blocks, the field refuses what a page may
// not hold, and a page's set decides who may create, edit, move, read and publish it.

const run = Date.now().toString(36)
let payload: Payload
const created: (number | string)[] = []

const as = (role: string) => ({ id: 1, collection: 'users', email: `${role}@wuwf.org`, roles: [role] }) as never
const editor = as('editor')
const publisher = as('publisher')
const sponsorship = as('sponsorship')
const membership = as('membership')
const asUser = (user: unknown) => ({ overrideAccess: false, user: user as never, context: { disableRevalidate: true } })

const cards = (extra: Record<string, unknown> = {}) => ({ blockType: 'sectionCards', cards: [{ title: 'On air', href: '/sponsor/on-air' }], ...extra })

async function make(user: unknown, title: string, data: Record<string, unknown> = {}, draft = false) {
  const page = await payload.create({
    collection: 'pages',
    draft,
    ...asUser(user),
    data: { title: `${title} ${run}`, template: 'sections', sections: [cards()], _status: draft ? 'draft' : 'published', ...data } as never,
  })
  created.push(page.id)
  return page
}
const read = (id: number | string, user?: unknown, draft = true) =>
  payload.findByID({ collection: 'pages', id, depth: 0, draft, overrideAccess: false, context: { disableRevalidate: true }, ...(user ? { user: user as never } : {}) })

describe('pages built from sections', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  }, 60_000)
  afterAll(async () => {
    for (const id of created.reverse()) await payload.delete({ collection: 'pages', id, overrideAccess: true, context: { disableRevalidate: true } }).catch(() => undefined)
  })

  describe('the sections field', () => {
    it('keeps a block with its tone, anchor, heading and cards, and publishes', async () => {
      const page = await make(publisher, 'Cards page', {
        sections: [cards({ tone: 'dark', anchor: 'where', heading: { eyebrow: 'Start', title: 'Where you can appear' } })],
      })
      expect(page._status).toBe('published')
      const read0 = await payload.findByID({ collection: 'pages', id: page.id, depth: 0, overrideAccess: true })
      const block = read0.sections?.[0] as Record<string, any>
      expect(block.blockType).toBe('sectionCards')
      expect(block.tone).toBe('dark')
      expect(block.anchor).toBe('where')
      expect(block.heading.title).toBe('Where you can appear')
      expect(block.cards[0].href).toBe('/sponsor/on-air')
      expect(block.hidden).toBe(false)
    })

    // The headline of a Payload validation error names the field; what is wrong is in its detail.
    const refusal = async (p: Promise<unknown>): Promise<string> => {
      try {
        await p
      } catch (e) {
        const err = e as { message?: string; data?: { errors?: Array<{ message?: string; path?: string }> } }
        return [err.message, ...(err.data?.errors ?? []).map((x) => `${x.path}: ${x.message}`)].join(' | ')
      }
      return 'NOT REFUSED'
    }

    it('refuses at publish a repeated anchor, a badly written anchor, an address that is not a link, and a block type that is not offered', async () => {
      expect(await refusal(make(publisher, 'Dup anchors', { sections: [cards({ anchor: 'a' }), cards({ anchor: 'a' })] }))).toMatch(/Two sections use the anchor "a"/)
      expect(await refusal(make(publisher, 'Bad anchor', { sections: [cards({ anchor: 'On Air' })] }))).toMatch(/sections\.0\.anchor: Use lower-case words/)
      expect(await refusal(make(publisher, 'Bad link', { sections: [{ blockType: 'sectionCards', cards: [{ title: 'x', href: 'javascript:alert(1)' }] }] }))).toMatch(/cards\.0\.href: Use a path on this site/)
      expect(await refusal(make(publisher, 'Unknown block', { sections: [{ blockType: 'nonsense' }] }))).toMatch(/"nonsense" is not allowed/)
    })

    it('lets a draft save with those mistakes (a draft skips validation, as everywhere)', async () => {
      const draft = await make(editor, 'Draft with mistakes', { sections: [cards({ anchor: 'a' }), cards({ anchor: 'a' })] }, true)
      expect(draft._status).toBe('draft')
    })

    it('accepts one anchor used once and blank anchors on several sections', async () => {
      await make(publisher, 'Fine anchors', { sections: [cards({ anchor: 'a' }), cards({ anchor: 'b' }), cards(), cards({ anchor: '' })] })
    })
  })

  describe('who may do what, by page set', () => {
    it('lets an editor write pages in no set and in the open sets, and publishes nothing', async () => {
      await make(editor, 'Editor no set', {}, true)
      await make(editor, 'Editor listens', { pageSet: 'listens' }, true)
      await expect(make(editor, 'Editor live', { pageSet: 'listens' })).rejects.toThrow(/publisher/)
    })

    it('keeps the sponsor and giving sets from an editor, for creating, editing and moving a page in', async () => {
      await expect(make(editor, 'Editor sponsor', { pageSet: 'sponsor' }, true)).rejects.toThrow(/page set/)
      await expect(make(editor, 'Editor giving', { pageSet: 'giving' }, true)).rejects.toThrow(/page set/)
      const sponsorPage = await make(publisher, 'Sponsor page', { pageSet: 'sponsor' })
      await expect(payload.update({ collection: 'pages', id: sponsorPage.id, ...asUser(editor), draft: true, data: { title: `Edited ${run}` } as never })).rejects.toThrow()
      const mine = await make(editor, 'Mine', { pageSet: 'listens' }, true)
      await expect(payload.update({ collection: 'pages', id: mine.id, ...asUser(editor), draft: true, data: { pageSet: 'sponsor' } as never })).rejects.toThrow(/page set/)
      const unchanged = await payload.findByID({ collection: 'pages', id: mine.id, draft: true, depth: 0, overrideAccess: true })
      expect(unchanged.pageSet).toBe('listens')
    })

    it('lets a publisher publish in every set, and move a page between sets', async () => {
      for (const set of ['sponsor', 'giving', 'listens', 'voyager', 'unearthing', 'radiolive']) {
        const p = await make(publisher, `Publisher ${set}`, { pageSet: set })
        expect(p._status).toBe('published')
      }
      const p = await make(publisher, 'Movable', { pageSet: 'listens' })
      const moved = await payload.update({ collection: 'pages', id: p.id, ...asUser(publisher), data: { pageSet: 'giving' } as never })
      expect(moved.pageSet).toBe('giving')
    })

    it('lets membership staff create, edit and publish giving pages, and nothing else', async () => {
      const draft = await make(membership, 'Membership draft', { pageSet: 'giving' }, true)
      expect(draft._status).toBe('draft')
      const live = await make(membership, 'Membership live', { pageSet: 'giving' })
      expect(live._status).toBe('published')
      await payload.update({ collection: 'pages', id: live.id, ...asUser(membership), data: { title: `Membership edit ${run}` } as never })

      await expect(make(membership, 'Membership no set', {}, true)).rejects.toThrow(/page set/)
      await expect(make(membership, 'Membership sponsor', { pageSet: 'sponsor' }, true)).rejects.toThrow(/page set/)
      const other = await make(publisher, 'Other set page', { pageSet: 'listens' })
      await expect(payload.update({ collection: 'pages', id: other.id, ...asUser(membership), data: { title: `x ${run}` } as never })).rejects.toThrow()
      await expect(payload.update({ collection: 'pages', id: live.id, ...asUser(membership), data: { pageSet: 'sponsor' } as never })).rejects.toThrow(/page set/)
      await expect(payload.delete({ collection: 'pages', id: live.id, ...asUser(membership) })).rejects.toThrow()
    })

    it('lets sponsorship staff create no page', async () => {
      await expect(make(sponsorship, 'Sponsorship page', {}, true)).rejects.toThrow()
    })

    it('shows drafts to content staff, giving drafts also to membership staff, and only published pages to the public', async () => {
      const givingDraft = await make(publisher, 'Giving draft', { pageSet: 'giving' }, true)
      const listensDraft = await make(publisher, 'Listens draft', { pageSet: 'listens' }, true)
      const ids = async (user?: unknown) =>
        (await payload.find({ collection: 'pages', limit: 500, depth: 0, pagination: false, draft: true, overrideAccess: false, ...(user ? { user: user as never } : {}), where: { title: { like: run } } })).docs.map((d) => d.id)
      expect(await ids(editor)).toEqual(expect.arrayContaining([givingDraft.id, listensDraft.id]))
      const m = await ids(membership)
      expect(m).toContain(givingDraft.id)
      expect(m).not.toContain(listensDraft.id)
      const pub = await ids()
      expect(pub).not.toContain(givingDraft.id)
      expect(pub).not.toContain(listensDraft.id)
      await expect(read(listensDraft.id, membership)).rejects.toThrow()
      expect((await read(givingDraft.id, membership))._status).toBe('draft')
    })
  })
})
