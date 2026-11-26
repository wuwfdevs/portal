import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// jsdom has no matchMedia; the dialog asks it whether the window is wide (it never closes for that here).
window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const start = vi.fn()
let configured = true
vi.mock('@/lib/analytics/dispatch', () => ({ posthog: { start: () => start() }, productAnalyticsConfigured: () => configured }))

const { ConsentBanner, openPrivacySettings } = await import('./index')
const { CONSENT_KEY, readConsent } = await import('@/lib/analytics/consent-store')

let host: HTMLDivElement
let root: Root
const draw = () => act(() => root.render(React.createElement(ConsentBanner, { privacyHref: '/privacy' })))
const banner = () => host.querySelector('[data-consent-banner]')
const button = (label: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined
const click = (el: Element | undefined) => act(() => (el as HTMLElement).click())

beforeEach(() => {
  localStorage.clear()
  configured = true
  start.mockClear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('ConsentBanner', () => {
  it('shows the notice with a privacy link until a choice is made, and starts PostHog', () => {
    draw()
    expect(banner()).not.toBeNull()
    expect(host.querySelector('a[href="/privacy"]')).not.toBeNull()
    expect(start).toHaveBeenCalled()
  })
  it('Decline records measurement off, in this browser, and the notice goes', () => {
    draw()
    click(button('Decline'))
    expect(readConsent()).toEqual({ measurement: false, personalization: false })
    expect(localStorage.getItem(CONSENT_KEY)).toContain('"measurement":false')
    expect(banner()).toBeNull()
  })
  it('Accept records measurement on', () => {
    draw()
    click(button('Accept'))
    expect(readConsent()?.measurement).toBe(true)
    expect(banner()).toBeNull()
  })
  it('does not show again once a choice is stored', () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: 1, measurement: true, personalization: false, at: '2026-11-26T00:00:00Z' }))
    draw()
    expect(banner()).toBeNull()
  })
  it('opens the settings from the footer and saves what is ticked', () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: 1, measurement: true, personalization: false, at: '2026-11-26T00:00:00Z' }))
    draw()
    act(() => openPrivacySettings())
    const dialog = host.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    const box = host.querySelector('[role="checkbox"]') as HTMLElement
    expect(box.getAttribute('aria-checked')).toBe('true')
    click(box)
    click(button('Save choices'))
    expect(readConsent()?.measurement).toBe(false)
    expect(host.querySelector('[role="dialog"]')).toBeNull()
  })
  it('draws nothing and starts nothing without PostHog configured', () => {
    configured = false
    draw()
    expect(host.innerHTML).toBe('')
    expect(start).not.toHaveBeenCalled()
  })
})
