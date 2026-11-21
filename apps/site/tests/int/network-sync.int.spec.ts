// @vitest-environment node
import { getPayload, type Payload, type Where } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { CdsReader } from '@/lib/network/sync'
import { payloadSyncStore } from '@/lib/network/payload-store'
import { finderOf, runNetworkPoll } from '@/lib/network/run'

// A whole poll against a real database with a fake CDS: stories saved once, restricted ones never, dismissed ones left alone, a held story
// that turns restricted blanked and its post taken down, a published story that was pulled flagged, old waiting stories cleaned out.
// Nothing leaves the machine.

type Doc = { id: number; [key: string]: unknown }

const run = Date.now().toString(36)
const NOW = new Date()
let payload: Payload
let section: number | string
const cleanup: { collection: string; id: number | string }[] = []
const ctx = { disableRevalidate: true, disableEmbedding: true, networkSystem: true }

const story = (id: string, extra: Record<string, unknown> = {}) => ({
  id: `${id}-${run}`,
  title: `Story ${id} ${run}`,
  teaser: `Teaser ${id}`,
  profiles: [{ href: '/v1/profiles/story', rels: ['type'] }],
  publishDateTime: new Date(NOW.getTime() - 30 * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  owners: [{ href: 'https://organization.api.npr.org/v4/services/s583' }],
  webPages: [{ href: `https://station.example.org/${id}`, rels: ['canonical'] }],
  ...extra,
})

/**
 * A CDS that serves one set of stories for "what is new" and looks stories up by id. A story it lists as new can be looked up too (as the real
 * one can); `byId` adds or overrides stories, and a story that is in neither answer is one the source has pulled.
 */
function fakeCds(fresh: unknown[], byId: Record<string, unknown> = {}): CdsReader {
  const known: Record<string, unknown> = { ...Object.fromEntries((fresh as { id: string }[]).map((d) => [d.id, d])), ...byId }
  return {
    async get(query) {
      const params = new URLSearchParams(query)
      if (params.has('ids')) return { resources: params.get('ids')!.split(',').flatMap((id) => (id in known ? [known[id]] : [])) }
      return { resources: fresh }
    },
  }
}

async function source(data: Record<string, unknown> = {}): Promise<Doc> {
  const doc = (await payload.create({ collection: 'network-sources', overrideAccess: true, context: ctx, data: { name: `WLRN ${run}`, findBy: 'owner', serviceId: 's583', ...data } as never })) as unknown as Doc
  cleanup.push({ collection: 'network-sources', id: doc.id })
  return doc
}

const items = async (sourceId: number, extra?: Where) =>
  (await payload.find({ collection: 'network-items', where: extra ? { and: [{ source: { equals: sourceId } }, extra] } : { source: { equals: sourceId } }, limit: 100, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as Doc[]

const para = (text: string) => ({ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text, format: 0, mode: 'normal', style: '', detail: 0 }] })

async function publishedPost(title: string): Promise<Doc> {
  const doc = (await payload.create({
    collection: 'posts',
    overrideAccess: true,
    context: ctx,
    data: { title: `${title} ${run}`, content: { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [para(title)] } }, _status: 'published', section, source: 'wire', publishedAt: '2090-01-02T12:00:00.000Z' } as never,
  })) as unknown as Doc
  cleanup.push({ collection: 'posts', id: doc.id })
  return doc
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  const { ensureTestSection } = await import('../helpers/section')
  section = await ensureTestSection(payload)
}, 90_000)

// A poll visits every active source, and the fake CDS answers every source with the same stories, so a source left over from an earlier test
// would claim them first (one row per CDS id: the first source to find a story keeps it). Each test therefore starts with no active source.
beforeEach(async () => {
  await payload.update({ collection: 'network-sources', where: { active: { equals: true } }, data: { active: false } as never, overrideAccess: true, context: ctx })
})

afterAll(async () => {
  // Items first (they point at sources and posts), then the rest in reverse.
  const mine = await payload.find({ collection: 'network-items', where: { cdsId: { contains: run } }, limit: 500, pagination: false, depth: 0, overrideAccess: true })
  for (const d of mine.docs) await payload.delete({ collection: 'network-items', id: d.id, overrideAccess: true, context: ctx }).catch(() => undefined)
  for (const c of [...cleanup].reverse()) await payload.delete({ collection: c.collection as never, id: c.id, overrideAccess: true, context: ctx }).catch(() => undefined)
})

describe('which held stories get re-checked', () => {
  it('goes to the ones checked longest ago first, so every held story is reached in turn and none is starved', async () => {
    const s = await source({ name: `Rotation ${run}`, serviceId: 's590' })
    const hour = 3_600_000
    for (let i = 1; i <= 5; i += 1) {
      await payload.create({
        collection: 'network-items',
        overrideAccess: true,
        context: ctx,
        data: { title: `Held ${i} ${run}`, cdsId: `held${i}-${run}`, source: s.id, status: 'held', firstSeenAt: new Date(NOW.getTime() - 100 * hour).toISOString(), lastSeenAt: new Date(NOW.getTime() - (10 - i) * hour).toISOString() } as never,
      })
    }
    const store = payloadSyncStore(payload)
    // held1 was checked longest ago, held5 most recently.
    expect(await store.heldIds(s.id, 2)).toEqual([`held1-${run}`, `held2-${run}`])

    // Checking them refreshes their time, so the next run moves on to the next two, and then comes back round to the first.
    // (Each check happens at its own time, as it would across real runs: equal times would leave the order undefined.)
    const touch = (n: number) =>
      payload.update({ collection: 'network-items', where: { cdsId: { equals: `held${n}-${run}` } }, data: { lastSeenAt: new Date(NOW.getTime() + n * 60_000).toISOString() } as never, overrideAccess: true, context: ctx })
    await touch(1)
    await touch(2)
    expect(await store.heldIds(s.id, 2)).toEqual([`held3-${run}`, `held4-${run}`])
    await touch(3)
    await touch(4)
    expect(await store.heldIds(s.id, 2)).toEqual([`held5-${run}`, `held1-${run}`])
  })
})

describe('finderOf', () => {
  it('reads a finished source and refuses an unfinished one', () => {
    expect(finderOf({ findBy: 'owner', serviceId: ' s583 ' })).toEqual({ kind: 'owner', serviceId: 's583' })
    expect(finderOf({ findBy: 'collection', collectionId: 1003 })).toEqual({ kind: 'collection', collectionId: 1003 })
    expect(finderOf({ findBy: 'owner', serviceId: 'nope' })).toBeNull()
    expect(finderOf({ findBy: 'collection' })).toBeNull()
  })
})

describe('a poll', () => {
  it('does nothing and says so when the site has no CDS key', async () => {
    expect(await runNetworkPoll(payload, null)).toEqual({ status: 'not_configured' })
  })

  it('saves what it finds once, however many times it runs, and records the run on the source', async () => {
    const s = await source()
    const cds = fakeCds([story('a'), story('b')])
    const first = await runNetworkPoll(payload, cds, NOW)
    const mine = first.status === 'ok' ? first.sources.find((x) => x.name === s.name) : undefined
    expect(mine).toMatchObject({ found: 2, created: 2, restricted: 0, error: null })

    await runNetworkPoll(payload, cds, NOW)
    const rows = await items(s.id)
    expect(rows.map((r) => r.cdsId).sort()).toEqual([`a-${run}`, `b-${run}`])
    expect(rows.every((r) => r.status === 'new')).toBe(true)
    expect(rows[0]).toMatchObject({ canonicalUrl: expect.stringContaining('station.example.org') })

    const after = await payload.findByID({ collection: 'network-sources', id: s.id, overrideAccess: true, depth: 0 })
    expect(after.poll?.lastPolledAt).toBeTruthy()
    expect(after.poll?.error).toBeFalsy()
  })

  it('never stores a restricted story, only counts it', async () => {
    const s = await source({ name: `Restricted ${run}`, serviceId: 's584' })
    const secret = story('secret', { title: `Hidden headline ${run}`, isRestrictedToAuthorizedOrgServiceIds: true })
    const out = await runNetworkPoll(payload, fakeCds([secret, story('open')]), NOW)
    const mine = out.status === 'ok' ? out.sources.find((x) => x.name === s.name) : undefined
    expect(mine?.restricted).toBeGreaterThanOrEqual(1)
    const rows = await items(s.id)
    expect(rows.map((r) => r.cdsId)).toEqual([`open-${run}`])
    const anywhere = await payload.find({ collection: 'network-items', where: { title: { contains: 'Hidden headline' } }, overrideAccess: true, depth: 0 })
    expect(anywhere.totalDocs).toBe(0)
  })

  it('leaves a dismissed story dismissed when the source lists it again', async () => {
    const s = await source({ name: `Dismissed ${run}`, serviceId: 's585' })
    const cds = fakeCds([story('d')])
    await runNetworkPoll(payload, cds, NOW)
    const [row] = await items(s.id)
    await payload.update({ collection: 'network-items', id: row.id, data: { status: 'dismissed' } as never, overrideAccess: true, context: ctx })
    await runNetworkPoll(payload, cds, NOW)
    const rows = await items(s.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('dismissed')
    expect(rows[0].title).toBe('Dismissed')
  })

  it('flags a published story the source pulled, and deletes a waiting one', async () => {
    const s = await source({ name: `Pulled ${run}`, serviceId: 's586' })
    await runNetworkPoll(payload, fakeCds([story('p'), story('w')]), NOW)
    const rows = await items(s.id)
    const published = rows.find((r) => r.cdsId === `p-${run}`)!
    const post = await publishedPost('Pulled story')
    await payload.update({ collection: 'network-items', id: published.id, data: { status: 'published', post: post.id } as never, overrideAccess: true, context: ctx })

    // Next time the source has neither story in the new list and knows neither by id.
    const out = await runNetworkPoll(payload, fakeCds([]), NOW)
    const mine = out.status === 'ok' ? out.sources.find((x) => x.name === s.name) : undefined
    expect(mine?.gone).toBe(2)
    const left = await items(s.id)
    expect(left.map((r) => [r.cdsId, r.status])).toEqual([[`p-${run}`, 'gone']])
    expect(left[0].goneAt).toBeTruthy()
    // The post is untouched: an editor decides.
    expect((await payload.findByID({ collection: 'posts', id: post.id, overrideAccess: true })).id).toBe(post.id)
  })

  it('blanks a held story that turns restricted, and takes its post down', async () => {
    const s = await source({ name: `Turned ${run}`, serviceId: 's587' })
    await runNetworkPoll(payload, fakeCds([story('t')]), NOW)
    const [row] = await items(s.id)
    const post = await publishedPost('Turned story')
    await payload.update({ collection: 'network-items', id: row.id, data: { status: 'published', post: post.id } as never, overrideAccess: true, context: ctx })

    const nowRestricted = story('t', { isRestrictedToAuthorizedOrgServiceIds: true })
    const out = await runNetworkPoll(payload, fakeCds([], { [`t-${run}`]: nowRestricted }), NOW)
    const mine = out.status === 'ok' ? out.sources.find((x) => x.name === s.name) : undefined
    expect(mine?.takenDown).toBe(1)

    const after = (await items(s.id))[0]
    expect(after).toMatchObject({ status: 'dismissed', title: 'Dismissed', teaser: null, canonicalUrl: null })
    expect((await payload.findByID({ collection: 'posts', id: post.id, overrideAccess: true, draft: true })).id).toBe(post.id)
    const live = await payload.find({ collection: 'posts', where: { and: [{ id: { equals: post.id } }, { _status: { equals: 'published' } }] }, overrideAccess: true, draft: false, depth: 0 })
    expect(live.totalDocs).toBe(0)
  })

  it('refreshes a held story from what the source says now', async () => {
    const s = await source({ name: `Refresh ${run}`, serviceId: 's588' })
    await runNetworkPoll(payload, fakeCds([story('r')]), NOW)
    await runNetworkPoll(payload, fakeCds([], { [`r-${run}`]: story('r', { title: `Corrected headline ${run}` }) }), NOW)
    expect((await items(s.id))[0].title).toBe(`Corrected headline ${run}`)
  })

  it('clears out waiting stories first found over a month ago, even while the source still lists them, and keeps kept and recent ones', async () => {
    const s = await source({ name: `Retention ${run}`, serviceId: 's589' })
    const all = { [`old-${run}`]: story('old'), [`held-${run}`]: story('held'), [`fresh-${run}`]: story('fresh') }
    await runNetworkPoll(payload, fakeCds([story('old'), story('held'), story('fresh')], all), NOW)
    const rows = await items(s.id)
    const long = new Date(NOW.getTime() - 45 * 86_400_000).toISOString()
    const set = (cdsId: string, data: Record<string, unknown>) =>
      payload.update({ collection: 'network-items', id: rows.find((r) => r.cdsId === `${cdsId}-${run}`)!.id, data: data as never, overrideAccess: true, context: ctx })
    await set('old', { firstSeenAt: long })
    await set('held', { firstSeenAt: long, status: 'held' })
    // The source still has all three. Only the retention pass decides.
    const out = await runNetworkPoll(payload, fakeCds([], all), NOW)
    expect(out.status === 'ok' && out.deletedStale).toBeGreaterThanOrEqual(1)
    const left = (await items(s.id)).map((r) => [r.cdsId, r.status]).sort()
    expect(left).toEqual([[`fresh-${run}`, 'new'], [`held-${run}`, 'held']])
  })
})
