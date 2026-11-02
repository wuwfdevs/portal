import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Page, Post } from '@/payload-types'
import { resolveHome, resolvePath } from '@/utilities/resolvePath'

// The URL scheme (ROADMAP → URL scheme (decided)): one unique `path` per story or page, made once at first publish
// for new work, copied verbatim for migrated work, changed only by a publisher, and leaving a redirect when a live
// one changes. The catch-all route resolves it; these are the properties it relies on.

const run = Date.now().toString(36)
let payload: Payload
const created: { collection: 'posts' | 'pages' | 'sections' | 'redirects'; id: number | string }[] = []

const as = (role: string) => ({ id: 1, collection: 'users', email: `${role}@wuwf.org`, roles: [role] }) as never
const asUser = (user: never) => ({ user, overrideAccess: false as const })
const editor = as('editor')
const publisher = as('publisher')

const lexical = {
  root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: 'Body.', format: 0, mode: 'normal', style: '', detail: 0 }] }] },
}
const sys = { overrideAccess: true as const, context: { disableRevalidate: true } }

async function section(title: string) {
  const s = await payload.create({ collection: 'sections', data: { title: `${title} ${run}` } as never, ...sys })
  created.push({ collection: 'sections', id: s.id })
  return s
}
async function story(data: Record<string, unknown>, who: Record<string, unknown> = sys): Promise<Post> {
  const p = (await payload.create({ collection: 'posts', data: { content: lexical, ...data } as never, ...who } as never)) as unknown as Post
  created.push({ collection: 'posts', id: p.id })
  return p
}
async function page(data: Record<string, unknown>): Promise<Page> {
  const layout = [{ blockType: 'content', columns: [{ size: 'full', richText: lexical }] }]
  const p = (await payload.create({ collection: 'pages', data: { hero: { type: 'none' }, layout, ...data } as never, ...sys })) as unknown as Page
  created.push({ collection: 'pages', id: p.id })
  return p
}
/** Payload's ValidationError says "The following field is invalid: path"; the reason is in its errors list. */
async function rejectsWith(promise: Promise<unknown>, reason: RegExp): Promise<void> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e as { message: string; data?: { errors?: { message: string }[] } },
  )
  expect(err, 'expected the call to be refused').not.toBeNull()
  expect([err!.message, ...(err!.data?.errors ?? []).map((e) => e.message)].join(' | ')).toMatch(reason)
}
const redirectsFrom = async (from: string) =>
  (await payload.find({ collection: 'redirects', where: { from: { equals: from } }, depth: 0, limit: 5, overrideAccess: true })).docs

describe('paths', () => {
  let news: { id: number | string; slug: string }
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    news = (await section('Path News')) as never
  }, 60_000)
  afterAll(async () => {
    for (const { collection, id } of created.reverse()) await payload.delete({ collection, id, ...sys }).catch(() => undefined)
    // redirects made by path changes
    await payload.delete({ collection: 'redirects', where: { from: { like: run } }, ...sys }).catch(() => undefined)
  })

  describe('making a path', () => {
    it('a new story gets /{section}/{date}/{slug} at first publish, in the station\'s time zone', async () => {
      // 04:30 UTC on the 13th is 23:30 on the 12th in Central time.
      const p = await story({ title: `Late story ${run}`, _status: 'published', section: news.id, publishedAt: '2026-06-13T04:30:00.000Z' })
      expect(p.path).toBe(`/${news.slug}/2026-06-12/late-story-${run}`)
    })

    it('a draft has no path, and keeps none until it is published', async () => {
      const d = await story({ title: `Draft only ${run}`, _status: 'draft', section: news.id }, { ...sys, draft: true })
      expect(d.path ?? null).toBeNull()
      const pub = await payload.update({ collection: 'posts', id: d.id, data: { _status: 'published', publishedAt: '2026-07-01T15:00:00.000Z' } as never, ...sys })
      expect(pub.path).toBe(`/${news.slug}/2026-07-01/draft-only-${run}`)
    })

    it('publishing with no section and no path is refused, naming the section; saving a draft is not', async () => {
      await rejectsWith(story({ title: `No section ${run}`, _status: 'published' }), /Choose a section/)
      const d = await story({ title: `No section draft ${run}`, _status: 'draft' }, { ...sys, draft: true })
      expect(d.path ?? null).toBeNull()
    })

    it('the path is made once: editing the section or the title afterwards does not move the story', async () => {
      const other = await section('Other Path News')
      const p = await story({ title: `Stays put ${run}`, _status: 'published', section: news.id, publishedAt: '2026-08-02T15:00:00.000Z' })
      const before = p.path
      const after = await payload.update({ collection: 'posts', id: p.id, data: { section: other.id, title: `A different title ${run}` } as never, ...sys })
      expect(after.path).toBe(before)
      expect(after.slug).toBeTruthy()
    })

    it('a migrated story keeps Grove\'s exact path and it is never recomputed', async () => {
      const grove = `/${news.slug}/2013-10-05/grove-${run}` // not what the section + date + slug rule would make for this title
      const p = await story({ title: `Something else entirely ${run}`, _status: 'published', section: news.id, publishedAt: '2024-01-01T12:00:00.000Z', path: grove, legacy: { legacyPath: grove } })
      expect(p.path).toBe(grove)
      const updated = await payload.update({ collection: 'posts', id: p.id, data: { title: `Retitled ${run}` } as never, ...sys })
      expect(updated.path).toBe(grove)
    })

    it('a wire-style migrated path (no section) is accepted as given', async () => {
      const wire = `/2010-03-15/wire-${run}`
      expect((await story({ title: `Wire ${run}`, _status: 'published', path: wire })).path).toBe(wire)
    })

    it('a new page is served at /{slug}; the home page has no path of its own', async () => {
      const p = await page({ title: `About us ${run}`, _status: 'published' })
      expect(p.path).toBe(`/about-us-${run}`)
      const home = await payload.find({ collection: 'pages', where: { slug: { equals: 'home' } }, limit: 1, depth: 0, ...sys })
      if (home.docs[0]) expect(home.docs[0].path ?? null).toBeNull()
    })
  })

  describe('one path, one record', () => {
    it('rejects a second story with the same path, and a page with a story\'s path (and the reverse)', async () => {
      const p = `/${news.slug}/2020-02-02/taken-${run}`
      await story({ title: `Taken ${run}`, _status: 'published', path: p })
      await rejectsWith(story({ title: `Taken again ${run}`, _status: 'published', path: p }), /already used/)
      await rejectsWith(page({ title: `Page on a story path ${run}`, _status: 'published', path: p }), /already used/)
      const pg = await page({ title: `Page first ${run}`, _status: 'published', path: `/page-first-${run}` })
      await rejectsWith(story({ title: `Story on a page path ${run}`, _status: 'published', path: pg.path }), /already used/)
    })

    it('the same holds when an existing story or page is moved onto the other kind\'s path', async () => {
      const s = await story({ title: `Mover story ${run}`, _status: 'published', path: `/${news.slug}/2020-03-03/mover-story-${run}` })
      const pg = await page({ title: `Mover page ${run}`, _status: 'published' })
      await rejectsWith(payload.update({ collection: 'posts', id: s.id, data: { path: pg.path } as never, ...sys }), /already used/)
      await rejectsWith(payload.update({ collection: 'pages', id: pg.id, data: { path: s.path } as never, ...sys }), /already used/)
      // and nothing was changed by the refused attempts
      expect((await payload.findByID({ collection: 'posts', id: s.id, ...sys })).path).toBe(s.path)
      expect((await payload.findByID({ collection: 'pages', id: pg.id, ...sys })).path).toBe(pg.path)
    })

    it('a record may keep its own path when it is saved again', async () => {
      const p = await story({ title: `Resave ${run}`, _status: 'published', section: news.id, publishedAt: '2026-09-09T15:00:00.000Z' })
      await expect(payload.update({ collection: 'posts', id: p.id, data: { dek: 'x', path: p.path } as never, ...sys })).resolves.toBeTruthy()
    })

    it.each([
      ['a reserved first segment', '/support/anything'],
      ['a trailing slash', '/a/b/'],
      ['a space', '/a b'],
      ['dot segments', '/a/../b'],
      ['the home address', '/'],
    ])('rejects %s', async (_n, bad) => {
      await rejectsWith(story({ title: `Bad ${run}`, _status: 'published', path: bad }), /path|slash|space|belongs|segment|home/i)
    })
  })

  describe('who may change a path', () => {
    it('an editor cannot set or change one; a publisher can', async () => {
      const draft = await story({ title: `Editor draft ${run}`, _status: 'draft', section: news.id }, { ...sys, draft: true })
      await expect(
        payload.update({ collection: 'posts', id: draft.id, draft: true, data: { path: `/${news.slug}/2026-01-01/editor-picked-${run}` } as never, ...asUser(editor) }),
      ).rejects.toThrow(/publisher can set or change/)

      const live = await story({ title: `Live ${run}`, _status: 'published', section: news.id, publishedAt: '2026-05-05T15:00:00.000Z' })
      await expect(payload.update({ collection: 'posts', id: live.id, data: { path: `/${news.slug}/2026-05-05/moved-by-editor-${run}` } as never, ...asUser(editor) })).rejects.toThrow()
      const moved = await payload.update({ collection: 'posts', id: live.id, data: { path: `/${news.slug}/2026-05-05/moved-by-publisher-${run}` } as never, ...asUser(publisher) })
      expect(moved.path).toBe(`/${news.slug}/2026-05-05/moved-by-publisher-${run}`)
    })

    it('an editor saving a draft of a live story does not trip over the path it already has', async () => {
      const live = await story({ title: `Editor edits ${run}`, _status: 'published', section: news.id, publishedAt: '2026-05-06T15:00:00.000Z' })
      await expect(
        payload.update({ collection: 'posts', id: live.id, draft: true, data: { dek: 'new dek', path: live.path } as never, ...asUser(editor) }),
      ).resolves.toBeTruthy()
    })

    it('the Grove path is fixed once set for staff; the system may still set it', async () => {
      const g = `/${news.slug}/2014-04-04/fixed-${run}`
      const p = await story({ title: `Fixed ${run}`, _status: 'published', path: g, legacy: { legacyPath: g } })
      await expect(payload.update({ collection: 'posts', id: p.id, data: { legacy: { legacyPath: `/other/${run}` } } as never, ...asUser(publisher) })).rejects.toThrow(/fixed once set/)
      const sysUpdate = await payload.update({ collection: 'posts', id: p.id, data: { legacy: { legacyPath: g, nprId: `npr-${run}` } } as never, ...sys })
      expect(sysUpdate.legacy?.nprId).toBe(`npr-${run}`)
    })
  })

  describe('redirects when a live path changes', () => {
    it('leaves a redirect from the old path to the new, and flattens a chain', async () => {
      const a = `/${news.slug}/2019-01-01/chain-a-${run}`
      const b = `/${news.slug}/2019-01-01/chain-b-${run}`
      const c = `/${news.slug}/2019-01-01/chain-c-${run}`
      const p = await story({ title: `Chain ${run}`, _status: 'published', path: a })

      await payload.update({ collection: 'posts', id: p.id, data: { path: b } as never, ...sys })
      expect((await redirectsFrom(a))[0]?.to?.url).toBe(b)

      await payload.update({ collection: 'posts', id: p.id, data: { path: c } as never, ...sys })
      expect((await redirectsFrom(b))[0]?.to?.url).toBe(c)
      expect((await redirectsFrom(a))[0]?.to?.url).toBe(c) // not a -> b -> c
    })

    it('moving a story back removes the redirect that sat on its address (no loop)', async () => {
      const a = `/${news.slug}/2019-02-02/loop-a-${run}`
      const b = `/${news.slug}/2019-02-02/loop-b-${run}`
      const p = await story({ title: `Loop ${run}`, _status: 'published', path: a })
      await payload.update({ collection: 'posts', id: p.id, data: { path: b } as never, ...sys })
      await payload.update({ collection: 'posts', id: p.id, data: { path: a } as never, ...sys })
      expect(await redirectsFrom(a)).toHaveLength(0)
      expect((await redirectsFrom(b))[0]?.to?.url).toBe(a)
    })

    it('a story that was never published has no public address to keep, so no redirect', async () => {
      const a = `/${news.slug}/2019-03-03/never-a-${run}`
      const p = await story({ title: `Never live ${run}`, _status: 'draft', path: a }, { ...sys, draft: true })
      await payload.update({ collection: 'posts', id: p.id, draft: true, data: { path: `/${news.slug}/2019-03-03/never-b-${run}` } as never, ...sys })
      expect(await redirectsFrom(a)).toHaveLength(0)
    })
  })

  describe('resolving a path', () => {
    it('finds a published story and a published page by path, and nothing for an unknown one', async () => {
      const s = await story({ title: `Resolvable ${run}`, _status: 'published', section: news.id, publishedAt: '2026-03-03T15:00:00.000Z' })
      const pg = await page({ title: `Resolvable page ${run}`, _status: 'published' })
      const hitStory = await resolvePath(s.path as string, false)
      expect(hitStory).toMatchObject({ kind: 'post', doc: { id: s.id } })
      expect(await resolvePath(pg.path as string, false)).toMatchObject({ kind: 'page', doc: { id: pg.id } })
      expect(await resolvePath(`/nothing/here-${run}`, false)).toBeNull()
    })

    it('a public visitor never reaches a draft; an authorised preview does', async () => {
      const g = `/${news.slug}/2018-08-08/hidden-${run}`
      const d = await story({ title: `Hidden ${run}`, _status: 'draft', path: g }, { ...sys, draft: true })
      expect(await resolvePath(g, false)).toBeNull()
      expect(await resolvePath(g, true)).toMatchObject({ kind: 'post', doc: { id: d.id } })
    })

    it('a story unpublished after being live stops resolving', async () => {
      const s = await story({ title: `Pulled ${run}`, _status: 'published', section: news.id, publishedAt: '2026-04-04T15:00:00.000Z' })
      expect(await resolvePath(s.path as string, false)).not.toBeNull()
      await payload.update({ collection: 'posts', id: s.id, data: { _status: 'draft' } as never, ...sys })
      expect(await resolvePath(s.path as string, false)).toBeNull()
    })

    it('the home page is found by its slug, not a path', async () => {
      const home = await resolveHome(false)
      if (home) expect(home.path ?? null).toBeNull()
    })
  })

  describe('sections', () => {
    it('a section\'s address name must be a safe lowercase segment and not one the site owns', async () => {
      // On create the slug is tidied (so "Not Valid" becomes "not-valid"); a later edit to something unsafe is refused.
      const ok = await section('Tidy Section')
      await expect(payload.update({ collection: 'sections', id: ok.id, data: { slug: 'Not Valid' } as never, ...sys })).rejects.toThrow(/lowercase/)
      await expect(payload.create({ collection: 'sections', data: { title: 'Support' } as never, ...sys })).rejects.toThrow(/belongs to the site/)
    })
    it('only a publisher can create or change one', async () => {
      await expect(payload.create({ collection: 'sections', data: { title: `By editor ${run}` } as never, ...asUser(editor) })).rejects.toThrow()
      const s = await payload.create({ collection: 'sections', data: { title: `By publisher ${run}` } as never, ...asUser(publisher) })
      created.push({ collection: 'sections', id: s.id })
    })
  })
})
