import { describe, expect, it } from 'vitest'

import { ago, audioNote, bulkTargets, imageNote, pageRange, queueFilter, queueHref, queuePage, rowMoves, thumbnailHref } from './queue'
import { statusChangeAllowed } from './status'

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

describe('paging', () => {
  it('reads a page number only when it is a plain positive whole number', () => {
    expect(queuePage('3')).toBe(3)
    for (const bad of [undefined, '', '0', '-2', '2.5', '1; drop', ['2'], 7]) expect(queuePage(bad), String(bad)).toBe(1)
  })

  it('says which stories a page shows', () => {
    expect(pageRange(1, 25, 112)).toEqual({ from: 1, to: 25, pages: 5 })
    expect(pageRange(5, 25, 112)).toEqual({ from: 101, to: 112, pages: 5 })
    expect(pageRange(9, 25, 112)).toEqual({ from: 101, to: 112, pages: 5 })
    expect(pageRange(1, 25, 0)).toEqual({ from: 0, to: 0, pages: 1 })
  })
})

describe('queueHref', () => {
  it('leaves the defaults out, so the plain address stays plain', () => {
    expect(queueHref('/admin/collections/network-items', {})).toBe('/admin/collections/network-items')
    expect(queueHref('/q', { view: 'waiting', source: null, page: 1 })).toBe('/q')
  })
  it('carries the view, source and page', () => {
    expect(queueHref('/q', { view: 'held', source: 4, page: 3 })).toBe('/q?view=held&source=4&page=3')
    expect(queueHref('/q', { source: 0 })).toBe('/q?source=0')
  })
})

describe('thumbnailHref', () => {
  it('draws a picture only from an https address', () => {
    expect(thumbnailHref('https://media.npr.org/a.jpg')).toBe('https://media.npr.org/a.jpg')
    for (const bad of ['http://media.npr.org/a.jpg', 'javascript:alert(1)', 'data:image/png;base64,AA', '//media.npr.org/a.jpg', 'not a url', '', null, undefined]) {
      expect(thumbnailHref(bad), String(bad)).toBeNull()
    }
  })
})

describe('what an editor may do with a story', () => {
  it('offers only moves that status.ts allows', () => {
    for (const status of ['new', 'held', 'gone'] as const) {
      const m = rowMoves(status)
      if (m.keep) expect(statusChangeAllowed(status, m.keep.to, false), `${status} -> ${m.keep.to}`).toBe(true)
      expect(statusChangeAllowed(status, 'dismissed', false), `${status} -> dismissed`).toBe(true)
    }
    expect(rowMoves('gone').keep).toBeNull()
  })

  it('applies a bulk action to the stories it may, and counts the rest', () => {
    const rows = [
      { id: '1', status: 'new' as const },
      { id: '2', status: 'held' as const },
      { id: '3', status: 'gone' as const },
    ]
    expect(bulkTargets(rows, 'held')).toEqual({ ids: ['1'], skipped: 2 })
    expect(bulkTargets(rows, 'new')).toEqual({ ids: ['2'], skipped: 2 })
    expect(bulkTargets(rows, 'dismissed')).toEqual({ ids: ['1', '2', '3'], skipped: 0 })
  })
})
