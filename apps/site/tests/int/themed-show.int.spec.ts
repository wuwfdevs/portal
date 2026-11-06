// @vitest-environment node
import { getPayload, handleEndpoints, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureTestSection } from '../helpers/section'

import { loadShowByPath } from '@/lib/shows/load'
import { loadThemedShow } from '@/lib/shows/themed-load'

// A themed show (phase 7a, boards 21-24): its own look, its Field Notes and Archive, members' items marked and held back.

const run = Date.now().toString(36)
let payload: Payload
const created: { collection: string; id: string | number }[] = []
const ctx = { disableRevalidate: true }
const body = (text: string) => ({ root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text, format: 0, mode: 'normal', style: '', detail: 0 }] }] } })
const pdf = (name: string) => {
  const data = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\nxref\n0 1\ntrailer<<>>\nstartxref\n0\n%%EOF\n')
  return { data, mimetype: 'application/pdf', name: `${name}-${run}.pdf`, size: data.length }
}

async function make<T extends { id: string | number }>(collection: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<T> {
  const doc = (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx, ...extra })) as unknown as T
  created.push({ collection, id: doc.id })
  return doc
}

describe('a themed show', () => {
  let show: { id: string | number; path: string }
  let plain: { id: string | number; path: string }
  let freeItem: { id: string | number; filename: string }
  let membersItem: { id: string | number; filename: string }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const section = await ensureTestSection(payload)
    show = await make('productions', { title: `Barefoot ${run}`, theme: 'barefoot-mary', showSupport: { heading: 'Join the Descent', donateUrl: 'https://wuwf.org/donate?fund=bm' } })
    plain = await make('productions', { title: `Plain ${run}` })
    const story = (title: string, day: number, extra: Record<string, unknown>) =>
      make('posts', { title: `${title} ${run}`, content: body(title), _status: 'published', section, production: show.id, publishedAt: `2090-04-0${day}T12:00:00.000Z`, ...extra })
    await story('Ep zero', 1, { format: 'audio' })
    await story('An essay', 2, { format: 'web', fieldNoteKind: 'essay' })
    await story('Clippings', 3, { format: 'web', fieldNoteKind: 'primary-source', membersOnly: true })
    await story('Draft note', 4, { format: 'web', _status: 'draft' })
    freeItem = await make('archive-items', { title: `Survey ${run}`, production: show.id, kind: 'document', source: 'Corps of Engineers, 1903', _status: 'published' }, { file: pdf('survey') })
    membersItem = await make('archive-items', { title: `Notes ${run}`, production: show.id, kind: 'transcript', membersOnly: true, _status: 'published' }, { file: pdf('notes') })
    await make('archive-items', { title: `Unpublished ${run}`, production: show.id, _status: 'draft' }, { file: pdf('draft') })
  }, 90_000)

  afterAll(async () => {
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('loads only a show that has a theme', async () => {
    expect(await loadThemedShow(plain.path)).toBeNull()
    expect(await loadShowByPath(plain.path)).not.toBeNull()
    const d = await loadThemedShow(show.path)
    expect(d?.theme.id).toBe('barefoot-mary')
    expect(d?.show.showSupport?.heading).toBe('Join the Descent')
  })

  it('lists published Field Notes (stories of the show that are not episodes), newest first, with their labels', async () => {
    const d = await loadThemedShow(show.path)
    expect(d?.fieldNotes.map((n) => [n.title, n.fieldNoteKind, n.membersOnly])).toEqual([
      [`Clippings ${run}`, 'primary-source', true],
      [`An essay ${run}`, 'essay', false],
    ])
    expect(d?.episodes.map((e) => e.title)).toEqual([`Ep zero ${run}`])
  })

  it('shows the whole public catalogue, but no address for a members-only file', async () => {
    const d = await loadThemedShow(show.path)
    const byTitle = new Map(d!.archive.map((a) => [a.title, a]))
    expect([...byTitle.keys()].sort()).toEqual([`Notes ${run}`, `Survey ${run}`])
    expect(byTitle.get(`Survey ${run}`)?.url).toBeTruthy()
    const members = byTitle.get(`Notes ${run}`) as unknown as Record<string, unknown>
    expect(members.membersOnly).toBe(true)
    expect(members.url).toBeUndefined()
    expect(members.filename).toBeUndefined()
  })

  it('refuses a members-only archive file at its address, and serves a free one privately', async () => {
    const get = (f: string) => handleEndpoints({ config, request: new Request(`http://localhost:3000/api/archive-items/file/${encodeURIComponent(f)}`) })
    expect((await get(membersItem.filename)).status).toBe(403)
    const ok = await get(freeItem.filename)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('Cache-Control')).toBe('private')
  })

  it('gives staff the members-only file', async () => {
    const editor = { id: 1, collection: 'users', email: 'e@wuwf.org', roles: ['editor'] }
    const doc = (await payload.findByID({ collection: 'archive-items', id: membersItem.id, overrideAccess: false, user: editor as never })) as { url?: string }
    expect(doc.url).toBeTruthy()
  })

  it('refuses a donation address that is not a page here or a secure web address', async () => {
    const err = await payload
      .update({ collection: 'productions', id: show.id, data: { showSupport: { donateUrl: 'javascript:alert(1)' } } as never, overrideAccess: true, context: ctx })
      .then(() => null, (e: unknown) => e)
    expect(err).not.toBeNull()
  })
})
