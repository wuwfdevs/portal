import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DateItem } from '@/lib/section-data/shape'

import { testContext } from '../testing'
import { DatesSection, DatesView } from './Component'

let clock = '2026-12-01T12:00:00.000Z'
let loaded: DateItem[] = []
const loadDates = vi.fn(async () => loaded)
vi.mock('@/lib/section-data/load', () => ({
  loadDates: (...a: unknown[]) => (loadDates as unknown as (...x: unknown[]) => unknown)(...a),
  sectionClock: async () => clock,
}))

const line = (id: string, startsAt: string, over: Partial<DateItem> = {}): DateItem => ({ id, title: `Show ${id}`, startsAt, endsAt: null, place: 'Museum of Commerce', href: `/radiolive/${id}`, ...over })
const view = (block: Record<string, unknown>, items: DateItem[]) => renderToStaticMarkup(createElement(DatesView, { block: { blockType: 'sectionDates', ...block }, items }))
const draw = async (block: Record<string, unknown>) => {
  const out = await DatesSection({ block: { blockType: 'sectionDates', ...block } as never, context: testContext })
  return out ? renderToStaticMarkup(out as never) : ''
}
beforeEach(() => {
  clock = '2026-12-01T12:00:00.000Z'
  loaded = []
  loadDates.mockClear()
})

describe('Dates section: sources', () => {
  it('draws nothing for an unknown source', async () => {
    expect(await draw({})).toBe('')
    expect(await draw({ source: 'ical' })).toBe('')
  })
  it('typed: keeps the dates still to come by the cached clock, soonest first, at most the count; reads nothing else', async () => {
    const out = await draw({
      source: 'typed', count: 2,
      items: [
        { title: 'Later', startsAt: '2026-12-20T00:00:00Z' },
        { title: 'Already over', startsAt: '2026-11-01T00:00:00Z' },
        { title: 'Soonest', startsAt: '2026-12-04T00:00:00Z', place: 'Studio A' },
        { title: 'Beyond the count', startsAt: '2027-01-01T00:00:00Z' },
        { title: '', startsAt: '2026-12-05T00:00:00Z' },
      ],
    })
    expect(out).not.toContain('Already over')
    expect(out).not.toContain('Beyond the count')
    expect(out.indexOf('Soonest')).toBeLessThan(out.indexOf('Later'))
    expect(out).toContain('Studio A')
    expect(loadDates).not.toHaveBeenCalled()
  })
  it('typed: a date drops off once the clock passes it', async () => {
    const items = [{ title: 'Open house', startsAt: '2026-12-04T00:00:00Z', endsAt: '2026-12-04T03:00:00Z' }]
    expect(await draw({ source: 'typed', items })).toContain('Open house')
    clock = '2026-12-04T03:00:01.000Z'
    expect(await draw({ source: 'typed', items })).toBe('')
  })
  it('radiolive and events: asked of the loader with the count', async () => {
    loaded = [line('a', '2026-12-04T00:00:00Z')]
    expect(await draw({ source: 'radiolive', count: 3 })).toContain('Show a')
    expect(loadDates).toHaveBeenLastCalledWith({ source: 'radiolive', count: 3 })
    await draw({ source: 'events' })
    expect(loadDates).toHaveBeenLastCalledWith({ source: 'events', count: 6 })
  })
  it('draws nothing when there is nothing to come', async () => {
    expect(await draw({ source: 'radiolive' })).toBe('')
  })
})

describe('Dates section: layouts', () => {
  const items = [line('a', '2026-12-04T00:00:00Z'), line('b', '2027-01-08T00:30:00Z', { place: null, href: null })]
  it('rows: the station\'s local date and time, the place, a machine-readable time and a link', () => {
    const out = view({ variant: 'rows', tone: 'accent', actionLabel: 'Save your seat' }, items)
    expect(out).toContain('data-tone="accent"')
    expect(out).toContain('dateTime="2026-12-04T00:00:00Z"')
    expect(out).toContain('Dec')
    expect(out).toContain('Thursday · 6 p.m. · Museum of Commerce')
    expect(out).toContain('Friday · 6:30 p.m.')
    expect(out).toContain('Save your seat')
    expect(out.match(/Save your seat/g)?.length).toBe(1)
  })
  it('cards: a card each, with "Details" by default', () => {
    const out = view({ variant: 'cards' }, items)
    expect(out).toContain('sm:grid-cols-2')
    expect(out).toContain('Details')
  })
  it('never draws a link for an unsafe address', () => {
    expect(view({}, [line('x', '2026-12-04T00:00:00Z', { href: 'javascript:alert(1)' })])).not.toContain('javascript')
  })
})
