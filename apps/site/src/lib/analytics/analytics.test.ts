import { describe, expect, it, vi } from 'vitest'

import { allows, categoryOf } from './consent'
import { createDispatcher, type AnalyticsSink } from './dispatch'
import { parseEvent, placementEvent, type PlacementEvent } from './events'
import { inView, isDue, NOT_VIEWED, observe, VIEWABLE_MS } from './viewability'

const ev = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ name: 'sponsor_placement_viewable', placement_id: '12', sponsor_id: '7', zone: 'home.rail', kind: 'sponsor', ...over })
const YES = { measurement: true, personalization: false }

describe('parseEvent', () => {
  it('accepts a well-formed placement event, and a house promotion with no sponsor', () => {
    expect(parseEvent(ev())).toEqual(ev())
    expect(parseEvent(ev({ kind: 'house', sponsor_id: null }))).toEqual(ev({ kind: 'house', sponsor_id: null }))
  })
  it('refuses unknown names, zones and kinds', () => {
    expect(parseEvent(ev({ name: 'page_viewed' }))).toBeNull()
    expect(parseEvent(ev({ zone: 'home.band' }))).toBeNull() // retired
    expect(parseEvent(ev({ zone: 'toString' }))).toBeNull()
    expect(parseEvent(ev({ kind: 'ad' }))).toBeNull()
  })
  it('refuses anything that is not an id, so no title or free text rides along', () => {
    expect(parseEvent(ev({ placement_id: 'Acme Hardware: holiday sale' }))).toBeNull()
    expect(parseEvent(ev({ placement_id: '' }))).toBeNull()
    expect(parseEvent(ev({ placement_id: 12 }))).toBeNull()
    expect(parseEvent(ev({ sponsor_id: 'x'.repeat(65) }))).toBeNull()
    expect(parseEvent(ev({ sponsor_id: undefined }))).toBeNull()
  })
  it('refuses extra fields', () => {
    expect(parseEvent(ev({ url: 'https://wuwf.org/news/x' }))).toBeNull()
    expect(parseEvent(ev({ visitor: 'abc' }))).toBeNull()
  })
  it('refuses what is not an object', () => {
    for (const v of [null, undefined, 'sponsor_placement_viewable', 1, [ev()]]) expect(parseEvent(v)).toBeNull()
  })
  it('builds the event from a placement reference', () => {
    expect(placementEvent('sponsor_placement_clicked', { placement_id: '12', sponsor_id: null, zone: 'list.top', kind: 'sponsor' })).toEqual({
      name: 'sponsor_placement_clicked',
      placement_id: '12',
      sponsor_id: null,
      zone: 'list.top',
      kind: 'sponsor',
    })
  })
})

describe('consent', () => {
  const e = parseEvent(ev()) as PlacementEvent
  it('puts placement events under counting, which needs no choice (provisional, until counsel answers)', () => {
    for (const name of ['sponsor_placement_measurable', 'sponsor_placement_viewable', 'sponsor_placement_clicked'] as const) expect(categoryOf({ ...e, name })).toBe('counting')
    expect(allows(null, e)).toBe(true)
    expect(allows({ measurement: false, personalization: false }, e)).toBe(true)
  })
})

describe('the dispatcher', () => {
  const sinkOf = () => {
    const sent: unknown[] = []
    const sink: AnalyticsSink = { send: (x) => void sent.push(x) }
    return { sent, sink }
  }
  it('hands a checked event to the sink when the visitor allows it', () => {
    const { sent, sink } = sinkOf()
    expect(createDispatcher({ sink, consent: () => YES }).track(ev() as unknown as PlacementEvent)).toBe(true)
    expect(sent).toEqual([ev()])
  })
  it('sends a placement count with no choice made, and nothing malformed', () => {
    const { sent, sink } = sinkOf()
    expect(createDispatcher({ sink, consent: () => null }).track(ev() as unknown as PlacementEvent)).toBe(true)
    expect(createDispatcher({ sink, consent: () => YES }).track(ev({ title: 'x' }) as unknown as PlacementEvent)).toBe(false)
    expect(sent).toEqual([ev()])
  })
  it('never throws when the sink or the consent check fails', () => {
    const broken: AnalyticsSink = { send: vi.fn(() => { throw new Error('down') }) }
    expect(createDispatcher({ sink: broken, consent: () => YES }).track(ev() as unknown as PlacementEvent)).toBe(false)
    expect(createDispatcher({ sink: broken, consent: () => { throw new Error('storage blocked') } }).track(ev() as unknown as PlacementEvent)).toBe(false)
  })
})

describe('viewability', () => {
  it('needs half the unit in view, in a visible tab', () => {
    expect(inView(0.5, true)).toBe(true)
    expect(inView(0.49, true)).toBe(false)
    expect(inView(1, false)).toBe(false)
  })
  it('is due after one continuous second in view', () => {
    const s = observe(NOT_VIEWED, true, 1000)
    expect(isDue(s, 1000 + VIEWABLE_MS - 1)).toBe(false)
    expect(isDue(s, 1000 + VIEWABLE_MS)).toBe(true)
    expect(observe(s, true, 1500)).toBe(s) // staying in view keeps the start
  })
  it('restarts the second when the unit leaves view', () => {
    let s = observe(NOT_VIEWED, true, 0)
    s = observe(s, false, 900)
    expect(isDue(s, 1200)).toBe(false)
    s = observe(s, true, 1200)
    expect(isDue(s, 2100)).toBe(false)
    expect(isDue(s, 2200)).toBe(true)
  })
  it('counts once', () => {
    const done = { since: 0, done: true }
    expect(isDue(done, 5000)).toBe(false)
    expect(observe(done, false, 6000)).toBe(done)
  })
})
