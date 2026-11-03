import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadVoyagerHub } from '@/lib/voyager/load'

// The Voyager hub shows the stories published under one publishing identity, read through access control. The hub's settings
// are a global shared by every test run, so they are cleared afterwards.

const run = Date.now().toString(36)
let payload: Payload
const created: { collection: string; id: string | number }[] = []
const ctx = { disableRevalidate: true }
const body = { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: 'Body.', format: 0, mode: 'normal', style: '', detail: 0 }] }] } }

async function make<T extends { id: string | number }>(collection: string, data: Record<string, unknown>): Promise<T> {
  const doc = (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx })) as unknown as T
  created.push({ collection, id: doc.id })
  return doc
}
const setHub = (data: Record<string, unknown>) => payload.updateGlobal({ slug: 'voyager-hub', data: data as never, overrideAccess: true, context: ctx })

describe('The Voyager hub', () => {
  let identity: { id: string | number }
  let campus: { id: string | number }
  let sports: { id: string | number }
  let marisol: { id: string | number }
  let pod: { id: string | number }
  const ids: Record<string, string | number> = {}

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    identity = await make('publishing-identities', { name: `The Voyager ${run}`, kind: 'partner' })
    const wuwf = await make<{ id: string | number }>('publishing-identities', { name: `WUWF News ${run}`, kind: 'newsroom' })
    campus = await make('sections', { title: `Campus ${run}` })
    sports = await make('sections', { title: `Sports ${run}` })
    marisol = await make('contributors', { name: `Marisol Tran ${run}`, title: 'Reporter' })
    pod = await make('productions', { title: `The Voyager Weekly ${run}`, summary: 'Campus news in 15 minutes' })
    const story = async (key: string, day: number, extra: Record<string, unknown> = {}) => {
      const p = await make<{ id: string | number }>('posts', { title: `${key} ${run}`, content: body, _status: 'published', section: campus.id, publishingIdentity: identity.id, contributors: [marisol.id], publishedAt: `2090-05-${String(day).padStart(2, '0')}T12:00:00.000Z`, ...extra })
      ids[key] = p.id
    }
    await story('Alerts story', 1)
    await story('Library hours', 2)
    await story('Volleyball', 3, { section: sports.id })
    await story('Campus video', 4, { format: 'video' })
    await story('Draft story', 5, { _status: 'draft' })
    await story('WUWF story', 6, { publishingIdentity: wuwf.id })
  }, 90_000)

  afterAll(async () => {
    await payload.updateGlobal({ slug: 'voyager-hub', data: { identity: null, featured: null, sections: [], podcast: null, staff: [], join: { heading: null, text: null, href: null } } as never, overrideAccess: true, context: ctx }).catch(() => undefined)
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('is not set up until a publishing identity is chosen', async () => {
    await setHub({ identity: null })
    expect(await loadVoyagerHub()).toBeNull()
  })

  it('features the newest Voyager story, lists the next ones, and never shows a draft or another newsroom\'s story', async () => {
    await setHub({ identity: identity.id, featured: null, sections: [campus.id, sports.id] })
    const d = await loadVoyagerHub()
    expect(d?.featured?.title).toBe(`Campus video ${run}`)
    expect(d?.latest.map((s) => s.title)).toEqual([`Volleyball ${run}`, `Library hours ${run}`, `Alerts story ${run}`])
    const all = [d?.featured, ...(d?.latest ?? []), ...(d?.sections ?? []).flatMap((s) => s.stories)].map((s) => s?.title)
    expect(all).not.toContain(`Draft story ${run}`)
    expect(all).not.toContain(`WUWF story ${run}`)
  })

  it('honours an editor\'s featured pick, keeps it out of the latest rail, and drops a pick from another newsroom', async () => {
    await setHub({ featured: ids['Alerts story'] })
    const d = await loadVoyagerHub()
    expect(d?.featured?.title).toBe(`Alerts story ${run}`)
    expect(d?.latest.map((s) => s.title)).not.toContain(`Alerts story ${run}`)
    await setHub({ featured: ids['WUWF story'] })
    expect((await loadVoyagerHub())?.featured?.title).toBe(`Campus video ${run}`)
    await setHub({ featured: null })
  })

  it('shows each chosen section\'s newest stories in the order chosen, videos, the podcast and the staff with their roles', async () => {
    await setHub({
      sections: [sports.id, campus.id],
      podcast: pod.id,
      staff: [{ person: marisol.id, role: 'News editor' }, { person: marisol.id }],
      join: { heading: 'Write for us', text: 'Any UWF student.', href: 'https://example.org/join' },
    })
    const d = await loadVoyagerHub()
    expect(d?.sections.map((s) => [s.section.title, s.stories.map((x) => x.title)])).toEqual([
      [`Sports ${run}`, [`Volleyball ${run}`]],
      [`Campus ${run}`, [`Campus video ${run}`, `Library hours ${run}`]],
    ])
    expect(d?.videos.map((v) => v.title)).toEqual([`Campus video ${run}`])
    expect(d?.podcast).toMatchObject({ title: `The Voyager Weekly ${run}` })
    expect(d?.staff.map((m) => m.role)).toEqual(['News editor', 'Reporter'])
    expect(d?.join).toEqual({ heading: 'Write for us', text: 'Any UWF student.', href: 'https://example.org/join' })
  })

  it('refuses a join link that is not a safe address', async () => {
    await expect(setHub({ join: { href: 'javascript:alert(1)' } })).rejects.toThrow()
  })
})
