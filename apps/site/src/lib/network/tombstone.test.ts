import { describe, expect, it } from 'vitest'

import { retentionCutoffs } from './retention'
import { TOMBSTONE_TITLE, tombstoneFields } from './tombstone'

describe('tombstoneFields', () => {
  it('blanks everything about a story, so nothing of it is kept', () => {
    const t = tombstoneFields() as Record<string, unknown>
    expect(t.title).toBe(TOMBSTONE_TITLE)
    for (const key of ['teaser', 'publishedAt', 'modifiedAt', 'canonicalUrl', 'ownerHrefs', 'brandingHrefs', 'audioSkipped']) expect(t[key], key).toBeNull()
    expect(Object.values(t.image as object).every((v) => v === null)).toBe(true)
    expect(Object.values(t.audio as object).every((v) => v === null)).toBe(true)
  })

  it('does not share its nested objects between calls', () => {
    const a = tombstoneFields() as { image: Record<string, unknown> }
    a.image.href = 'changed'
    expect((tombstoneFields() as { image: Record<string, unknown> }).image.href).toBeNull()
  })
})

describe('retentionCutoffs', () => {
  it('counts back from now in whole days', () => {
    const c = retentionCutoffs(new Date('2026-11-18T12:00:00Z'), { newStoryDays: 30, heldStaleDays: 14 })
    expect(c.deleteNewBefore.toISOString()).toBe('2026-10-19T12:00:00.000Z')
    expect(c.staleHeldBefore.toISOString()).toBe('2026-11-04T12:00:00.000Z')
  })
})
