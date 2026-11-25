import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlacementRef } from '@/lib/analytics/events'

// Tells React this test drives updates through act(), as a test renderer would.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const track = vi.fn()
vi.mock('@/lib/analytics/dispatch', () => ({ analytics: { track: (e: unknown) => track(e) } }))

const { Tracked, countsAsClick } = await import('./Tracked')

// jsdom has no IntersectionObserver; this one lets a test say how much of the element is in view.
let report: ((ratio: number) => void) | null = null
let disconnected = 0
class FakeObserver {
  constructor(cb: IntersectionObserverCallback) {
    report = (ratio) => cb([{ intersectionRatio: ratio } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
  observe() {}
  disconnect() {
    disconnected++
  }
}

const REF: PlacementRef = { placement_id: '12', sponsor_id: '7', zone: 'home.rail', kind: 'sponsor' }
let host: HTMLDivElement
let root: Root
const names = () => track.mock.calls.map(([e]) => (e as { name: string }).name)
// The children go in as arguments (the lint rule's way), so the props are typed without them.
const props = (ref: PlacementRef | null) => ({ track: ref, className: 'card' }) as React.ComponentProps<typeof Tracked>
const draw = (ref: PlacementRef | null) =>
  act(() => root.render(React.createElement(Tracked, props(ref), React.createElement('p', null, 'Sponsor message'), React.createElement('a', { href: 'https://acme.example/' }, 'Acme'))))

beforeEach(() => {
  vi.useFakeTimers()
  track.mockClear()
  report = null
  disconnected = 0
  vi.stubGlobal('IntersectionObserver', FakeObserver)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('Tracked', () => {
  it('draws the card as a plain element with its class, so the tile looks the same', async () => {
    await draw(REF)
    expect(host.innerHTML).toBe('<div class="card"><p>Sponsor message</p><a href="https://acme.example/">Acme</a></div>')
  })
  it('counts the placement as measurable once it is on the page', async () => {
    await draw(REF)
    expect(track).toHaveBeenCalledWith({ name: 'sponsor_placement_measurable', ...REF })
  })
  it('counts it viewable after a continuous second at least half in view, once', async () => {
    await draw(REF)
    act(() => report!(0.6))
    act(() => vi.advanceTimersByTime(999))
    expect(names()).not.toContain('sponsor_placement_viewable')
    act(() => vi.advanceTimersByTime(1))
    expect(names().filter((n) => n === 'sponsor_placement_viewable')).toHaveLength(1)
    expect(disconnected).toBe(1)
  })
  it('does not count a unit scrolled past in under a second', async () => {
    await draw(REF)
    act(() => report!(1))
    act(() => vi.advanceTimersByTime(600))
    act(() => report!(0.2))
    act(() => vi.advanceTimersByTime(5000))
    expect(names()).not.toContain('sponsor_placement_viewable')
  })
  it('counts a click on the link, but not on the label or a scripted click', async () => {
    await draw(REF)
    const link = host.querySelector('a')!
    link.addEventListener('click', (e) => e.preventDefault())
    act(() => host.querySelector('p')!.click()) // a script's click is not trusted, and this one is not on the link anyway
    act(() => link.click()) // jsdom marks a scripted click untrusted
    expect(names()).not.toContain('sponsor_placement_clicked')
  })
  it('counts a real click or middle click on the link, and nothing else', () => {
    const click = { type: 'click', button: 0, trusted: true, onLink: true }
    expect(countsAsClick(click)).toBe(true)
    expect(countsAsClick({ ...click, type: 'auxclick', button: 1 })).toBe(true)
    expect(countsAsClick({ ...click, type: 'auxclick', button: 2 })).toBe(false) // a right click
    expect(countsAsClick({ ...click, trusted: false })).toBe(false)
    expect(countsAsClick({ ...click, onLink: false })).toBe(false)
  })
  it('watches nothing without a reference', async () => {
    await draw(null)
    expect(track).not.toHaveBeenCalled()
    expect(report).toBeNull()
  })
})
