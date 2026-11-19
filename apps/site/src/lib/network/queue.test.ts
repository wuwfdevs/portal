import { describe, expect, it } from 'vitest'

import { ago, audioNote, imageNote, queueFilter } from './queue'

describe('queueFilter', () => {
  it('shows waiting stories (new and kept) by default', () => {
    const f = queueFilter({})
    expect(f.view).toBe('waiting')
    expect(f.sourceId).toBeNull()
    expect(f.where).toEqual({ and: [{ status: { in: ['new', 'held'] } }] })
  })

  it('reads a view and a source', () => {
    expect(queueFilter({ view: 'gone', source: '12' }).where).toEqual({ and: [{ status: { in: ['gone'] } }, { source: { equals: 12 } }] })
    expect(queueFilter({ view: 'held' }).where).toEqual({ and: [{ status: { in: ['held'] } }] })
  })

  it('falls back to waiting for an unknown view, and ignores a source that is not a plain number', () => {
    expect(queueFilter({ view: 'everything' }).view).toBe('waiting')
    for (const bad of ['1; drop table', '12abc', '', '-1', '1e3', ['1'], 12, undefined]) expect(queueFilter({ source: bad }).sourceId, String(bad)).toBeNull()
  })

  it('never offers dismissed or published stories: the queue is for stories still to decide', () => {
    for (const view of ['waiting', 'held', 'gone', 'dismissed', 'published']) {
      const statuses = JSON.stringify(queueFilter({ view }).where)
      expect(statuses).not.toContain('dismissed')
      expect(statuses).not.toContain('published')
    }
  })
})

describe('ago', () => {
  const now = new Date('2026-11-18T12:00:00Z')
  it('reads minutes, hours and days', () => {
    expect(ago('2026-11-18T11:59:40Z', now)).toBe('just now')
    expect(ago('2026-11-18T11:48:00Z', now)).toBe('12 min ago')
    expect(ago('2026-11-18T09:00:00Z', now)).toBe('3 hr ago')
    expect(ago('2026-11-15T12:00:00Z', now)).toBe('3 days ago')
  })
  it('says nothing for a missing or unreadable date, and never goes negative', () => {
    expect(ago(null, now)).toBeNull()
    expect(ago('yesterday-ish', now)).toBeNull()
    expect(ago('2026-11-18T13:00:00Z', now)).toBe('just now')
  })
})

describe('notes for what was left out', () => {
  it('explain why audio and pictures are missing', () => {
    expect(audioNote('tracked')).toMatch(/tracking/)
    expect(audioNote('expired')).toMatch(/expired/)
    expect(audioNote(null)).toBeNull()
    expect(audioNote('not-a-reason')).toBeNull()
    expect(imageNote(true)).toMatch(/restricted/)
    expect(imageNote(false)).toBeNull()
  })
})
