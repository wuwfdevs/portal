import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureTestSection } from '../helpers/section'

// The migration from Grove keys every record on its Grove path and NPR id (stable identity), and marks NPR-owned
// stories so they are never treated as ours. These are the properties it relies on.

const run = Date.now().toString(36)
let payload: Payload
const created: (string | number)[] = []

const lexical = {
  root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: 'Body.', format: 0, mode: 'normal', style: '', detail: 0 }] }] },
}
// A migrated story is published at its Grove path; a native one gets its path from its section.
const post = async (title: string, extra: Record<string, unknown> = {}) => {
  const legacyPath = (extra.legacy as { legacyPath?: string } | undefined)?.legacyPath
  const where = legacyPath ? { path: legacyPath } : { section: await ensureTestSection(payload) }
  return payload.create({ collection: 'posts', overrideAccess: true, context: { disableRevalidate: true }, data: { title, content: lexical, _status: 'published', ...where, ...extra } as never })
}

describe('stable identity for migrated content', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  }, 60_000)
  afterAll(async () => {
    for (const id of created) await payload.delete({ collection: 'posts', id, overrideAccess: true, context: { disableRevalidate: true } }).catch(() => undefined)
  })

  it('a new story is WUWF\'s own and carries no legacy identity', async () => {
    const p = await post(`Native ${run}`)
    created.push(p.id)
    expect(p.source).toBe('wuwf')
    expect(p.legacy?.legacyPath ?? null).toBeNull()
    expect(p.legacy?.nprId ?? null).toBeNull()
  })

  it('keeps the Grove path and the NPR id, and marks an NPR story as NPR\'s', async () => {
    const p = await post(`From NPR ${run}`, { source: 'npr', legacy: { legacyPath: `/news/2020-01-02/npr-${run}`, nprId: `npr-${run}` } })
    created.push(p.id)
    expect(p.source).toBe('npr')
    expect(p.legacy?.legacyPath).toBe(`/news/2020-01-02/npr-${run}`)
    expect(p.legacy?.nprId).toBe(`npr-${run}`)
  })

  it('refuses a second record claiming the same Grove path or NPR id, so a re-run cannot create duplicates', async () => {
    const a = await post(`First ${run}`, { legacy: { legacyPath: `/local/x-${run}`, nprId: `n-${run}` } })
    created.push(a.id)
    await expect(post(`Dup path ${run}`, { legacy: { legacyPath: `/local/x-${run}` } })).rejects.toThrow()
    await expect(post(`Dup npr ${run}`, { legacy: { nprId: `n-${run}` } })).rejects.toThrow()
  })

  it('lets any number of stories have no legacy identity at all', async () => {
    const [a, b, c] = await Promise.all([post(`N1 ${run}`), post(`N2 ${run}`), post(`N3 ${run}`)])
    created.push(a.id, b.id, c.id)
    expect([a, b, c]).toHaveLength(3)
  })

  it('can be found by its Grove path, which is how a redirect map resolves an old URL', async () => {
    const p = await post(`Findable ${run}`, { legacy: { legacyPath: `/arts/f-${run}` } })
    created.push(p.id)
    const found = await payload.find({ collection: 'posts', where: { 'legacy.legacyPath': { equals: `/arts/f-${run}` } }, overrideAccess: true, limit: 1 })
    expect(found.docs[0]?.id).toBe(p.id)
  })

  it('keeps Grove\'s contentId and modified date, finds a story by the id, and refuses a second story with the same id', async () => {
    const groveId = `00000170-20c2-d6af-af72-${run.padEnd(12, '0').slice(0, 12)}`
    const modifiedAt = '2019-03-04T17:05:06.000Z'
    const p = await post(`Grove id ${run}`, { legacy: { legacyPath: `/local-news/2019-03-01/grove-id-${run}`, groveId, modifiedAt } })
    created.push(p.id)
    expect(p.legacy?.groveId).toBe(groveId)
    // the source's modified date is its own field, not the time this record was saved here
    expect(new Date(p.legacy?.modifiedAt as string).toISOString()).toBe(modifiedAt)
    expect(new Date(p.updatedAt).getTime()).toBeGreaterThan(new Date(modifiedAt).getTime())
    const found = await payload.find({ collection: 'posts', where: { 'legacy.groveId': { equals: groveId } }, overrideAccess: true, limit: 1 })
    expect(found.docs[0]?.id).toBe(p.id)
    await expect(post(`Same id ${run}`, { legacy: { legacyPath: `/local-news/2019-03-01/same-id-${run}`, groveId } })).rejects.toThrow()
  })

  it('the Grove id is fixed once set for staff, and a re-run by the system can restate it', async () => {
    const groveId = `00000170-20c3-df2b-ab7b-${run.padEnd(12, '1').slice(0, 12)}`
    const p = await post(`Fixed id ${run}`, { legacy: { legacyPath: `/local-news/2019-03-02/fixed-id-${run}`, groveId } })
    created.push(p.id)
    const staff = { id: 1, collection: 'users', email: 'publisher@wuwf.org', roles: ['publisher'] } as never
    await expect(
      payload.update({ collection: 'posts', id: p.id, user: staff, overrideAccess: false, data: { legacy: { groveId: `${groveId}-x` } } as never }),
    ).rejects.toThrow(/Grove id is fixed/)
    const again = await payload.update({ collection: 'posts', id: p.id, overrideAccess: true, context: { disableRevalidate: true }, data: { legacy: { groveId, modifiedAt: '2020-01-01T00:00:00.000Z' } } as never })
    expect(again.legacy?.groveId).toBe(groveId)
  })
})
