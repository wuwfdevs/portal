import { describe, expect, it } from 'vitest'

import { syncSource, type CdsReader, type SourceToSync, type SyncStore } from './sync'
import type { NetworkCandidate } from './types'

const NOW = new Date('2026-11-18T12:00:00Z')
const SRC: SourceToSync = { id: 1, name: 'WLRN', finder: { kind: 'owner', serviceId: 's583' }, mode: 'queue', cursor: new Date('2026-11-18T08:00:00Z') }

const doc = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Story ${id}`,
  profiles: [{ href: '/v1/profiles/story', rels: ['type'] }],
  publishDateTime: '2026-11-18T10:00:00Z',
  ...extra,
})

/** A fake CDS that answers new-story queries from one list and `ids=` queries from another, and remembers what was asked. */
function fakeCds(opts: { fresh?: unknown[][]; byId?: Record<string, unknown>; fail?: (query: string) => Error | null } = {}) {
  const asked: string[] = []
  const pages = [...(opts.fresh ?? [[]])]
  const cds: CdsReader = {
    async get(query) {
      asked.push(query)
      const failure = opts.fail?.(query)
      if (failure) throw failure
      const params = new URLSearchParams(query)
      if (params.has('ids')) {
        const wanted = params.get('ids')!.split(',')
        return { resources: wanted.flatMap((id) => (opts.byId && id in opts.byId ? [opts.byId[id]] : [])) }
      }
      return { resources: pages.shift() ?? [] }
    },
  }
  return { cds, asked }
}

/** An in-memory store with the rules the real one has: one row per CDS id, dismissed rows left alone. */
function fakeStore(held: string[] = [], dismissed: string[] = []) {
  const rows = new Map<string, { status: string; title: string }>()
  const log = { markGone: [] as string[], takeDown: [] as string[] }
  const store: SyncStore = {
    async upsertCandidates(_source, candidates: NetworkCandidate[]) {
      const created: string[] = []
      const updated: string[] = []
      for (const c of candidates) {
        if (dismissed.includes(c.cdsId)) continue
        if (rows.has(c.cdsId) || held.includes(c.cdsId)) {
          rows.set(c.cdsId, { status: rows.get(c.cdsId)?.status ?? 'new', title: c.title })
          updated.push(c.cdsId)
        } else {
          rows.set(c.cdsId, { status: 'new', title: c.title })
          created.push(c.cdsId)
        }
      }
      return { created, updated }
    },
    async heldIds() {
      return held
    },
    async markGone(ids) {
      log.markGone.push(...ids)
    },
    async takeDown(ids) {
      log.takeDown.push(...ids)
    },
  }
  return { store, rows, log }
}

const run = (source: SourceToSync, cds: CdsReader, store: SyncStore, extra: Record<string, unknown> = {}) => syncSource(source, { cds, store, now: () => NOW, ...extra })

describe('syncSource: what is new', () => {
  it('asks for stories published since the cursor, by owner, and saves them', async () => {
    const { cds, asked } = fakeCds({ fresh: [[doc('a'), doc('b')]] })
    const { store, rows } = fakeStore()
    const out = await run(SRC, cds, store)
    const q = new URLSearchParams(asked[0])
    expect(q.get('ownerHrefs')).toBe('https://organization.api.npr.org/v4/services/s583')
    expect(q.get('publishDateTime')).toBe('2026-11-18T08:00:00Z...')
    expect(out.created).toEqual(['a', 'b'])
    expect([...rows.keys()]).toEqual(['a', 'b'])
    expect(out.error).toBeNull()
  })

  it('looks back a few days on a source\'s first run', async () => {
    const { cds, asked } = fakeCds()
    await run({ ...SRC, cursor: null }, cds, fakeStore().store, { firstRunLookbackHours: 24 })
    expect(new URLSearchParams(asked[0]).get('publishDateTime')).toBe('2026-11-17T12:00:00Z...')
  })

  it('moves the cursor to the newest story seen, less an hour of overlap', async () => {
    const { cds } = fakeCds({ fresh: [[doc('a', { publishDateTime: '2026-11-18T09:00:00Z' }), doc('b', { publishDateTime: '2026-11-18T11:30:00Z' })]] })
    const out = await run(SRC, cds, fakeStore().store)
    expect(out.cursor.toISOString()).toBe('2026-11-18T10:30:00.000Z')
    expect(out.run.cursor).toEqual(out.cursor)
  })

  it('keeps asking while pages come back full, and stops at the first short one', async () => {
    const full = Array.from({ length: 100 }, (_, i) => doc(`p1-${i}`))
    const short = [doc('p2-0')]
    const { cds, asked } = fakeCds({ fresh: [full, short] })
    const out = await run(SRC, cds, fakeStore().store)
    expect(asked.filter((q) => !q.startsWith('ids='))).toHaveLength(2)
    expect(new URLSearchParams(asked[1]).get('offset')).toBe('100')
    expect(out.found).toBe(101)
  })

  it('counts restricted stories and never saves them', async () => {
    const { cds } = fakeCds({ fresh: [[doc('ok'), doc('secret', { isRestrictedToAuthorizedOrgServiceIds: true })]] })
    const { store, rows } = fakeStore()
    const out = await run(SRC, cds, store)
    expect(out.restricted).toBe(1)
    expect(out.run.skippedRestricted).toBe(1)
    expect([...rows.keys()]).toEqual(['ok'])
  })

  it('leaves a dismissed story dismissed when it turns up again', async () => {
    const { cds } = fakeCds({ fresh: [[doc('no'), doc('yes')]] })
    const { store, rows } = fakeStore([], ['no'])
    const out = await run(SRC, cds, store)
    expect(out.created).toEqual(['yes'])
    expect(rows.has('no')).toBe(false)
  })

  it('queues a new story from an auto source and says it is waiting to be published', async () => {
    const { cds } = fakeCds({ fresh: [[doc('a')]] })
    const out = await run({ ...SRC, mode: 'auto' }, cds, fakeStore().store)
    expect(out.awaitingAutoPublish).toEqual(['a'])
    expect((await run(SRC, fakeCds({ fresh: [[doc('b')]] }).cds, fakeStore().store)).awaitingAutoPublish).toEqual([])
  })
})

/** A CDS that answers a new-stories query like the real one: stories from the cursor on, oldest first, paged by limit and offset. */
function listCds(docs: Record<string, unknown>[]) {
  const asked: string[] = []
  const cds: CdsReader = {
    async get(query) {
      asked.push(query)
      const params = new URLSearchParams(query)
      const since = Date.parse(params.get('publishDateTime')!.replace('...', ''))
      const offset = Number(params.get('offset') ?? 0)
      const limit = Number(params.get('limit') ?? 20)
      const sorted = docs.filter((d) => Date.parse(d.publishDateTime as string) >= since).sort((a, b) => Date.parse(a.publishDateTime as string) - Date.parse(b.publishDateTime as string))
      return { resources: sorted.slice(offset, offset + limit) }
    },
  }
  return { cds, asked }
}

describe('syncSource: the cursor and filtered stories', () => {
  // 500 restricted stories (the most one run reads), then one ordinary story: the cursor must get past the restricted ones, or the
  // ordinary story is never reached and every later run asks for the same five pages for ever.
  const at = (minutes: number) => new Date(Date.parse('2026-11-18T08:00:00Z') + minutes * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const restricted = Array.from({ length: 500 }, (_, i) => doc(`r${i}`, { isRestrictedToAuthorizedOrgServiceIds: true, publishDateTime: at(i + 1) }))
  const ordinary = doc('ordinary', { publishDateTime: at(501) })

  it('moves the cursor past restricted stories, so a later story is still reached', async () => {
    const { cds } = listCds([...restricted, ordinary])
    const { store, rows } = fakeStore()
    const first = await run({ ...SRC, cursor: new Date('2026-11-18T08:00:00Z') }, cds, store)
    expect(first.found).toBe(0)
    expect(first.restricted).toBe(500)
    expect(first.cursor.getTime()).toBeGreaterThan(Date.parse('2026-11-18T08:00:00Z'))

    const second = await run({ ...SRC, cursor: first.cursor }, cds, store)
    expect(second.created).toEqual(['ordinary'])
    expect([...rows.keys()]).toEqual(['ordinary'])
  })

  it('starts the next run exactly where a run that hit the page ceiling stopped, with no overlap that could stall it', async () => {
    const { cds } = listCds([...restricted, ordinary])
    const out = await run({ ...SRC, cursor: new Date('2026-11-18T08:00:00Z') }, cds, fakeStore().store)
    expect(out.cursor.toISOString()).toBe(new Date(Date.parse(at(500))).toISOString())
  })

  it('still keeps an hour of overlap when a run reached the end of what CDS had', async () => {
    const { cds } = listCds([doc('a', { publishDateTime: at(100) })])
    const out = await run({ ...SRC, cursor: new Date('2026-11-18T08:00:00Z') }, cds, fakeStore().store)
    expect(out.cursor.toISOString()).toBe(new Date(Date.parse(at(100)) - 3_600_000).toISOString())
  })

  it('moves the cursor on a short run of only restricted or non-story documents too', async () => {
    const { cds } = listCds([doc('r', { isRestrictedToAuthorizedOrgServiceIds: true, publishDateTime: at(200) })])
    const out = await run({ ...SRC, cursor: new Date('2026-11-18T08:00:00Z') }, cds, fakeStore().store)
    expect(out.cursor.getTime()).toBeGreaterThan(Date.parse('2026-11-18T08:00:00Z'))
  })
})

describe('syncSource: what we already hold', () => {
  it('flags a held story CDS no longer returns, and takes down one that turned restricted', async () => {
    const { cds, asked } = fakeCds({
      byId: { still: doc('still', { title: 'Updated headline' }), turned: doc('turned', { isRestrictedToAuthorizedOrgServiceIds: true }) },
    })
    const { store, rows, log } = fakeStore(['still', 'turned', 'removed'])
    const out = await run(SRC, cds, store)
    expect(asked.some((q) => q.startsWith('ids='))).toBe(true)
    expect(out.gone).toBe(1)
    expect(out.takenDown).toBe(1)
    expect(log.markGone).toEqual(['removed'])
    expect(log.takeDown).toEqual(['turned'])
    expect(rows.get('still')?.title).toBe('Updated headline')
  })

  it('does not re-check a story the same run just found', async () => {
    const { cds, asked } = fakeCds({ fresh: [[doc('a')]] })
    // The store reports the new story as held too (it was saved a moment ago), as the real one does.
    const { store } = fakeStore(['a'])
    const out = await run(SRC, cds, store)
    expect(asked.some((q) => q.startsWith('ids='))).toBe(false)
    expect(out.gone).toBe(0)
  })

  it('asks nothing about held stories when there are none', async () => {
    const { cds, asked } = fakeCds()
    await run(SRC, cds, fakeStore().store)
    expect(asked.some((q) => q.startsWith('ids='))).toBe(false)
  })
})

describe('syncSource: failures', () => {
  it('records the failure, keeps the cursor and does not throw', async () => {
    const { cds } = fakeCds({ fail: () => new Error('NPR CDS returned an error (503).') })
    const out = await run(SRC, cds, fakeStore().store)
    expect(out.error).toMatch(/503/)
    expect(out.cursor).toEqual(SRC.cursor)
    expect(out.run.error).toMatch(/503/)
  })

  it('does not call a held story gone because the check itself failed', async () => {
    const { cds } = fakeCds({ fail: (q) => (q.startsWith('ids=') ? new Error('boom') : null) })
    const { store, log } = fakeStore(['a'])
    const out = await run(SRC, cds, store)
    expect(out.error).toBe('boom')
    expect(log.markGone).toEqual([])
  })

  it('reports an unrecognised response instead of treating it as "no stories"', async () => {
    const cds: CdsReader = { get: async () => ({ list: { items: [] } }) }
    const out = await run(SRC, cds, fakeStore().store)
    expect(out.error).toMatch(/does not recognise/)
  })
})
