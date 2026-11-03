import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureTestSection } from '../helpers/section'

import { loadFellowshipHub } from '@/lib/fellowship/load'

// A fellowship's hub page, read the way a visitor's request reads it: through access control, with the funder line read
// on the server from records the public cannot see.

const run = Date.now().toString(36)
const TEXT = `Reporting through this fellowship is made possible in part by support from Hub Test Foundation ${run}.`
let payload: Payload
const created: { collection: string; id: string | number }[] = []

async function make<T extends { id: string | number }>(collection: string, data: Record<string, unknown>): Promise<T> {
  const doc = (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: { disableRevalidate: true } })) as unknown as T
  created.push({ collection, id: doc.id })
  return doc
}
const body = {
  root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: 'Body.', format: 0, mode: 'normal', style: '', detail: 0 }] }] },
}

describe('a fellowship hub', () => {
  let slug = ''
  let endedSlug = ''

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const sponsor = await make('sponsors', { name: `Hub Test Foundation ${run}` })
    const live = await make('underwriting-agreements', { label: `Hub ${run}`, sponsor: sponsor.id, kind: 'recognition', text: TEXT, startsOn: '2026-01-01', endsOn: null, active: true })
    const ended = await make('underwriting-agreements', { label: `Hub ended ${run}`, sponsor: sponsor.id, kind: 'recognition', text: 'Ended line.', startsOn: '2020-01-01', endsOn: '2020-12-31', active: true })
    const fellow = await make('contributors', { name: `Hub Fellow ${run}`, title: 'Fellow', bio: 'Covers the coast.' })
    const f = await make<{ id: string | number; slug: string }>('fellowships', {
      title: `Hub Fellowship ${run}`,
      summary: 'A year of reporting.',
      missionHeadline: 'We follow the money.',
      mission: 'The mission.',
      focusAreas: [{ title: 'Insurance & risk', blurb: 'What it costs to stay' }, { title: 'Water' }],
      termStartsOn: '2026-07-01',
      fellow: fellow.id,
      agreements: [live.id, ended.id],
    })
    slug = f.slug
    const section = await ensureTestSection(payload)
    const story = (title: string, extra: Record<string, unknown> = {}) =>
      make('posts', { title: `${title} ${run}`, content: body, _status: 'published', section, fellowship: f.id, ...extra })
    await story('Oldest', { publishedAt: '2026-08-01T12:00:00.000Z' })
    await story('Newest', { publishedAt: '2026-10-28T12:00:00.000Z' })
    await story('Podcast', { publishedAt: '2026-09-01T12:00:00.000Z', format: 'audio' })
    await story('Video', { publishedAt: '2026-09-15T12:00:00.000Z', format: 'video' })
    await make('posts', { title: `Draft ${run}`, content: body, _status: 'draft', fellowship: f.id, publishedAt: '2026-10-29T12:00:00.000Z' })
    const other = await make<{ id: string | number }>('fellowships', { title: `Other ${run}` })
    await make('posts', { title: `Elsewhere ${run}`, content: body, _status: 'published', section, fellowship: other.id, publishedAt: '2026-10-01T12:00:00.000Z' })
    const quiet = await make<{ id: string | number; slug: string }>('fellowships', { title: `Quiet ${run}`, agreements: [ended.id] })
    endedSlug = quiet.slug
  }, 60_000)

  afterAll(async () => {
    for (const { collection, id } of [...created].reverse()) await payload.delete({ collection: collection as never, id, overrideAccess: true, context: { disableRevalidate: true } }).catch(() => undefined)
  })

  it('is null for an address no fellowship has', async () => {
    expect(await loadFellowshipHub(`nothing-here-${run}`)).toBeNull()
  })

  it('loads the fellowship, its fellow and its editable mission', async () => {
    const d = await loadFellowshipHub(slug)
    expect(d?.fellowship.title).toBe(`Hub Fellowship ${run}`)
    expect(d?.fellow?.name).toBe(`Hub Fellow ${run}`)
    expect(d?.fellowship.missionHeadline).toBe('We follow the money.')
    expect(d?.fellowship.focusAreas?.map((a) => a.title)).toEqual(['Insurance & risk', 'Water'])
    expect(d?.fellowship.eyebrow).toBe('A WUWF reporting fellowship')
  })

  it('lists only published work from this fellowship, newest first, and counts it by kind', async () => {
    const d = await loadFellowshipHub(slug)
    expect(d?.stories.map((s) => s.title)).toEqual([`Newest ${run}`, `Video ${run}`, `Podcast ${run}`, `Oldest ${run}`])
    expect(d?.counts).toEqual({ stories: 2, episodes: 1, videos: 1 })
    expect(d?.stats).toBe('2 stories · 1 podcast episode · 1 video · since July 2026')
  })

  it('carries the funder line whose term is running, from records the public cannot read, and not an ended one', async () => {
    const d = await loadFellowshipHub(slug)
    expect(d?.acknowledgments.map((l) => l.text)).toEqual([TEXT])
    const quiet = await loadFellowshipHub(endedSlug)
    expect(quiet?.acknowledgments).toEqual([])
    // the public cannot read the agreement records themselves
    await expect(payload.find({ collection: 'underwriting-agreements', overrideAccess: false, limit: 1 })).rejects.toThrow(/not allowed/i)
  })
})
