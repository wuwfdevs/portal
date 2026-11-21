import { describe, expect, it } from 'vitest'

import { PAGE_THEMES, THEME_IDS } from '@/lib/page-themes/themes'

import { PAGE_SETS, PAGE_SET_IDS, canEditSet, canPublishSet, editableSets, isPageSetId, pageSetOf } from './registry'

const as = (...roles: string[]) => ({ roles })

describe('page sets registry', () => {
  it('has one spec per id, with its own id, a known theme and at least one permission', () => {
    for (const id of PAGE_SET_IDS) {
      const spec = PAGE_SETS[id]
      expect(spec.id).toBe(id)
      expect(THEME_IDS).toContain(spec.theme)
      expect(PAGE_THEMES[spec.theme]).toBeDefined()
      expect(spec.editBy.length).toBeGreaterThan(0)
      expect(spec.name.trim()).not.toBe('')
    }
  })
  it('recognises set ids only', () => {
    expect(isPageSetId('giving')).toBe(true)
    expect(isPageSetId('nonsense')).toBe(false)
    expect(isPageSetId(null)).toBe(false)
    expect(pageSetOf('sponsor')?.name).toBe('Sponsorship')
    expect(pageSetOf(undefined)).toBeNull()
  })
})

describe('who may edit which pages', () => {
  it('lets an editor edit pages in no set and the open sets, not the sponsor or giving sets', () => {
    const editor = as('editor')
    expect(canEditSet(editor, null)).toBe(true)
    for (const s of ['listens', 'voyager', 'unearthing', 'radiolive']) expect(canEditSet(editor, s)).toBe(true)
    expect(canEditSet(editor, 'sponsor')).toBe(false)
    expect(canEditSet(editor, 'giving')).toBe(false)
  })
  it('lets a publisher edit every set', () => {
    for (const s of [null, ...PAGE_SET_IDS]) expect(canEditSet(as('publisher'), s)).toBe(true)
  })
  it('lets membership staff edit the giving set and nothing else', () => {
    const m = as('membership')
    expect(canEditSet(m, 'giving')).toBe(true)
    for (const s of [null, 'sponsor', 'listens', 'voyager', 'unearthing', 'radiolive']) expect(canEditSet(m, s)).toBe(false)
    expect(editableSets(m)).toEqual({ sets: ['giving'], noSet: false })
  })
  it('lets sponsorship staff edit no page (their role is the sponsorship pages through a publisher, not content.write)', () => {
    expect(editableSets(as('sponsorship'))).toEqual({ sets: [], noSet: false })
  })
  it('lets an administrator edit everything and nobody signed-out edit anything', () => {
    expect(editableSets(as('administrator')).sets).toEqual([...PAGE_SET_IDS])
    expect(canEditSet(null, null)).toBe(false)
    expect(canEditSet(undefined, 'giving')).toBe(false)
  })
  it('lets only publishers publish, and membership staff publish giving pages', () => {
    expect(canPublishSet(as('editor'), null)).toBe(false)
    expect(canPublishSet(as('editor'), 'listens')).toBe(false)
    expect(canPublishSet(as('publisher'), 'sponsor')).toBe(true)
    expect(canPublishSet(as('membership'), 'giving')).toBe(true)
    expect(canPublishSet(as('membership'), 'sponsor')).toBe(false)
    expect(canPublishSet(as('membership'), null)).toBe(false)
  })
})

describe('placements policy', () => {
  it('carries no sponsor placement on the pages where a gift is made, a listener speaks, or sponsorship is sold', () => {
    expect(PAGE_SETS.giving.placements).toBe(false)
    expect(PAGE_SETS.listens.placements).toBe(false)
    expect(PAGE_SETS.sponsor.placements).toBe(false)
  })
})
