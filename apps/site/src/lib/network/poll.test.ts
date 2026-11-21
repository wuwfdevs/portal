import { describe, expect, it } from 'vitest'

import { parseDocumentsResponse } from './cds'
import { buildNewStoriesQuery, buildRecheckQueries, classifyRecheck, isServiceId, nextCursor, ownerHrefForService, toRfc3339 } from './poll'

const SINCE = new Date('2026-11-18T08:00:00.000Z')

describe('buildNewStoriesQuery', () => {
  it('finds a station by owner, oldest first, from the cursor on', () => {
    const q = new URLSearchParams(buildNewStoriesQuery({ kind: 'owner', serviceId: 's583' }, { since: SINCE }))
    expect(q.get('profileIds')).toBe('story')
    expect(q.get('ownerHrefs')).toBe('https://organization.api.npr.org/v4/services/s583')
    expect(q.get('publishDateTime')).toBe('2026-11-18T08:00:00Z...')
    expect(q.get('sort')).toBe('publishDateTime:asc')
    expect(q.get('collectionIds')).toBeNull()
  })

  it('finds an NPR section by collection id', () => {
    const q = new URLSearchParams(buildNewStoriesQuery({ kind: 'collection', collectionId: 1003 }, { since: SINCE }))
    expect(q.get('collectionIds')).toBe('1003')
    expect(q.get('ownerHrefs')).toBeNull()
  })

  it('keeps inside CDS limits: 300 a request, and limit + offset up to 2000', () => {
    const finder = { kind: 'owner', serviceId: 's1' } as const
    expect(() => buildNewStoriesQuery(finder, { since: SINCE, limit: 301 })).toThrow(/300/)
    expect(() => buildNewStoriesQuery(finder, { since: SINCE, limit: 300, offset: 1701 })).toThrow(/2000/)
    expect(() => buildNewStoriesQuery(finder, { since: SINCE, limit: 300, offset: 1700 })).not.toThrow()
  })

  it('refuses a service id or collection that could put other text in the address', () => {
    expect(() => buildNewStoriesQuery({ kind: 'owner', serviceId: 's1&limit=9999' }, { since: SINCE })).toThrow(/service id/)
    expect(() => buildNewStoriesQuery({ kind: 'collection', collectionId: 0 }, { since: SINCE })).toThrow()
    expect(isServiceId('s583')).toBe(true)
    expect(isServiceId('583')).toBe(false)
    expect(ownerHrefForService('s9')).toBe('https://organization.api.npr.org/v4/services/s9')
  })
})

describe('nextCursor', () => {
  it('moves to the newest publish time seen, minus an hour of overlap', () => {
    const seen = [{ publishedAt: '2026-11-18T09:00:00Z' }, { publishedAt: '2026-11-18T11:00:00Z' }, { publishedAt: null }]
    expect(toRfc3339(nextCursor(seen, SINCE))).toBe('2026-11-18T10:00:00Z')
  })

  it('never moves backwards, and stays put when nothing came back', () => {
    expect(nextCursor([], SINCE)).toBe(SINCE)
    expect(nextCursor([{ publishedAt: '2026-11-18T08:10:00Z' }], SINCE)).toBe(SINCE)
  })
})

describe('re-checking stories we hold', () => {
  it('asks for them by id, in chunks, without repeats', () => {
    const ids = Array.from({ length: 95 }, (_, i) => `d${i}`)
    const queries = buildRecheckQueries([...ids, 'd0'], 40)
    expect(queries).toHaveLength(3)
    expect(new URLSearchParams(queries[0]).get('ids')!.split(',')).toHaveLength(40)
    expect(new URLSearchParams(queries[2]).get('ids')!.split(',')).toHaveLength(15)
  })

  const doc = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `Story ${id}`, profiles: [{ href: '/v1/profiles/story', rels: ['type'] }], ...extra })

  it('sorts held stories into gone, restricted and still there', () => {
    const answer = parseDocumentsResponse({ resources: [doc('a'), doc('b', { isRestrictedToAuthorizedOrgServiceIds: true }), doc('z')] })
    const out = classifyRecheck(['a', 'b', 'c'], [answer])
    expect(out.gone).toEqual(['c'])
    expect(out.restricted).toEqual(['b'])
    expect(out.present.map((p) => p.cdsId)).toEqual(['a'])
  })

  it('does not call a story gone because it was in another chunk', () => {
    const one = parseDocumentsResponse({ resources: [doc('a')] })
    const two = parseDocumentsResponse({ resources: [doc('b')] })
    expect(classifyRecheck(['a', 'b'], [one, two]).gone).toEqual([])
  })
})
