import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadFeedState, loadLiveBlog } from '@/lib/live/load'

const run = Date.now().toString(36)
let payload: Payload
const created: { collection: string; id: string | number }[] = []
const ctx = { disableRevalidate: true }
const editor = { id: 1, collection: 'users', email: 'e@wuwf.org', roles: ['editor'] }
const publisher = { id: 2, collection: 'users', email: 'p@wuwf.org', roles: ['editor', 'publisher'] }

const text = (t: string) => ({ type: 'text', version: 1, text: t, format: 0, mode: 'normal', style: '', detail: 0 })
const body = (t: string) => ({ root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [text(t)] }] } })

async function make<T extends { id: string | number }>(collection: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<T> {
  const doc = (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx, ...extra })) as unknown as T
  created.push({ collection, id: doc.id })
  return doc
}
const update = (blog: { id: string | number }, headline: string, minute: number, extra: Record<string, unknown> = {}) =>
  make<{ id: string | number; anchor: string }>('live-updates', { livePost: blog.id, headline, body: body(`${headline} body`), postedAt: `2099-01-01T12:${String(minute).padStart(2, '0')}:00.000Z`, ...extra })

describe('live blogs', () => {
  let blog: { id: string | number; slug: string }
  let draftBlog: { id: string | number; slug: string }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    blog = await make('live-posts', { title: `Storm ${run}`, _status: 'published', description: 'Updates.' })
    draftBlog = await make('live-posts', { title: `Draft storm ${run}`, _status: 'draft' })
  }, 60_000)

  afterAll(async () => {
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('shows a published blog with its updates newest first, and gives each a stable anchor from its headline', async () => {
    const a = await update(blog, 'Shelters open at noon', 1)
    const b = await update(blog, 'Shelters open at noon', 2) // same headline: its anchor must differ
    const c = await update(blog, 'Road closures', 3)
    expect(a.anchor).toBe('shelters-open-at-noon')
    expect(b.anchor).toBe('shelters-open-at-noon-2')
    expect(c.anchor).toBe('road-closures')
    const d = await loadLiveBlog(blog.slug)
    expect(d?.live).toBe(true)
    expect(d?.updates.map((u) => u.headline)).toEqual(['Road closures', 'Shelters open at noon', 'Shelters open at noon'])
  })

  it('refuses a second update with an anchor already used in the same blog, but allows it in another blog', async () => {
    await expect(update(blog, 'Another', 9, { anchor: 'road-closures' })).rejects.toThrow(/already uses the anchor/)
    const other = await make<{ id: string | number }>('live-posts', { title: `Other ${run}`, _status: 'published' })
    await expect(update(other, 'Road closures', 1)).resolves.toMatchObject({ anchor: 'road-closures' })
  })

  it('never lets an anchor change by itself once set', async () => {
    const u = await update(blog, 'Power outages', 4)
    const changed = await payload.update({ collection: 'live-updates', id: u.id, data: { headline: 'Power restored' } as never, overrideAccess: true, context: ctx })
    expect(changed.anchor).toBe('power-outages')
  })

  it('keeps pinned updates apart from the rest, in the order set', async () => {
    const [first, second] = await Promise.all([update(blog, 'Pin me one', 5), update(blog, 'Pin me two', 6)])
    await payload.update({ collection: 'live-posts', id: blog.id, data: { pinned: [second.id, first.id], _status: 'published' } as never, overrideAccess: true, context: ctx })
    const d = await loadLiveBlog(blog.slug)
    expect(d?.pinned.map((u) => u.headline)).toEqual(['Pin me two', 'Pin me one'])
    expect(d?.updates.map((u) => u.headline)).not.toContain('Pin me one')
  })

  it('marks an update edited when its words change after posting, and not for a re-save that changes nothing', async () => {
    const u = await update(blog, 'Water advisory', 7)
    const same = await payload.update({ collection: 'live-updates', id: u.id, data: { headline: 'Water advisory' } as never, user: editor as never, overrideAccess: false, context: ctx })
    expect(same.editedAt ?? null).toBeNull()
    const changed = await payload.update({ collection: 'live-updates', id: u.id, data: { headline: 'Water advisory lifted' } as never, user: editor as never, overrideAccess: false, context: ctx })
    expect(typeof changed.editedAt).toBe('string')
  })

  it('lets an editor post an update, but not publish or end the blog; a publisher can end it, which stamps when', async () => {
    await expect(
      make('live-updates', { livePost: blog.id, headline: `By an editor ${run}`, body: body('x') }, { user: editor, overrideAccess: false }),
    ).resolves.toBeTruthy()
    await expect(payload.update({ collection: 'live-posts', id: blog.id, data: { coverage: 'ended', _status: 'published' } as never, user: editor as never, overrideAccess: false, context: ctx })).rejects.toThrow(/publisher/i)
    const ended = await payload.update({ collection: 'live-posts', id: blog.id, data: { coverage: 'ended', _status: 'published' } as never, user: publisher as never, overrideAccess: false, context: ctx })
    expect(ended.coverage).toBe('ended')
    expect(typeof ended.endedAt).toBe('string')
    const d = await loadLiveBlog(blog.slug)
    expect(d?.live).toBe(false)
  })

  it('hides a draft blog, and its updates, from the public', async () => {
    await update(draftBlog, 'Secret plan', 1)
    expect(await loadLiveBlog(draftBlog.slug)).toBeNull()
    const publicRead = await payload.find({ collection: 'live-updates', overrideAccess: false, where: { livePost: { equals: draftBlog.id } } })
    expect(publicRead.docs).toEqual([])
    // staff who can write content still see it (to review before publishing)
    const staffRead = await payload.find({ collection: 'live-updates', overrideAccess: false, user: editor as never, where: { livePost: { equals: draftBlog.id } } })
    expect(staffRead.docs).toHaveLength(1)
  })

  it('changes its token when an update is added, so a reader\'s page knows to offer the new one', async () => {
    const before = (await loadLiveBlog(blog.slug))?.token
    await update(blog, 'One more', 8)
    expect((await loadLiveBlog(blog.slug))?.token).not.toBe(before)
  })
  it('changes the token when only the blog changes (it is ended, its introduction is rewritten, its pins change), so open pages are told', async () => {
    const b = await make<{ id: string | number; slug: string }>('live-posts', { title: `Token blog ${run}`, _status: 'published' })
    const u = await update(b, 'Only update', 1)
    const publish = (data: Record<string, unknown>) => payload.update({ collection: 'live-posts', id: b.id, data: { ...data, _status: 'published' } as never, user: publisher as never, overrideAccess: false, context: ctx })
    const token = async () => (await loadLiveBlog(b.slug))?.token
    const t0 = await token()
    // the page and the status endpoint use one function: they always agree
    expect((await loadFeedState(b.slug))?.token).toBe(t0)

    await new Promise((r) => setTimeout(r, 1100)) // updatedAt has second resolution in some paths: make the change visibly later
    await publish({ intro: body('A new introduction.') })
    const t1 = await token()
    expect(t1).not.toBe(t0)

    await new Promise((r) => setTimeout(r, 1100))
    await publish({ pinned: [u.id] })
    const t2 = await token()
    expect(t2).not.toBe(t1)

    await new Promise((r) => setTimeout(r, 1100))
    await publish({ coverage: 'ended' })
    const t3 = await token()
    expect(t3).not.toBe(t2)
    const state = await loadFeedState(b.slug)
    expect(state).toMatchObject({ live: false, token: t3 })
  })

  it('has no state for a blog that is not published', async () => {
    expect(await loadFeedState(draftBlog.slug)).toBeNull()
  })
})
