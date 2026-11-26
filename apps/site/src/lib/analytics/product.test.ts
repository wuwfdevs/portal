import { describe, expect, it, vi } from 'vitest'

import { privacyHrefOf } from '@/Footer/privacy'

import { allows, categoryOf, DECLINED, DEFAULT_CONSENT, effectiveConsent } from './consent'
import { parseStoredConsent, storedConsentText } from './consent-store'
import { createDispatcher, routingSink, type AnalyticsSink } from './dispatch'
import { isRead, scrollDepth, showContentRef, storyContentRef } from './engagement'
import { parseEvent, parsePlacementEvent, type AnalyticsEvent } from './events'
import { listenRefOf, listenSeconds, marksReached, sameListen } from './listening'
import { cookieDomains, createPostHogDestination, isPostHogStorageName, postHogCookieNames, type PostHogClient } from './posthog'
import { posthogRewrites, RELAY_PATH, trailingSlashRedirect } from './posthog-config'

const placement: AnalyticsEvent = { name: 'sponsor_placement_viewable', placement_id: '12', sponsor_id: '3', zone: 'story.inline', kind: 'sponsor' } as AnalyticsEvent
const listen: AnalyticsEvent = { name: 'listen_started', source: 'live', stream_id: 'channel-1' }

describe('the product-analytics events', () => {
  it('accepts each event with exactly its fields', () => {
    const good: AnalyticsEvent[] = [
      listen,
      { name: 'listen_stopped', source: 'on_demand', stream_id: 'audio-12', seconds: 95 },
      { name: 'audio_progressed', audio_id: 'audio-12', percent: 50 },
      { name: 'content_viewed', content_id: '881', content_kind: 'episode', format: 'audio', show_id: '4', topic_id: null },
      { name: 'content_engaged', content_id: '881', content_kind: 'story', engagement_kind: 'read' },
      { name: 'membership_appeal_shown', appeal_kind: 'membership', surface: 'story' },
      { name: 'membership_appeal_clicked', appeal_kind: 'support', surface: 'section' },
      { name: 'conversion_started', surface: 'give_page', frequency: 'monthly' },
    ]
    for (const e of good) expect(parseEvent(e)).toEqual(e)
  })
  it('refuses free text, extra or missing fields, and numbers out of range', () => {
    expect(parseEvent({ name: 'content_viewed', content_id: 'Hurricane season begins', content_kind: 'story', format: null, show_id: null, topic_id: null })).toBeNull()
    expect(parseEvent({ ...listen, title: 'Morning Edition' })).toBeNull()
    expect(parseEvent({ name: 'listen_stopped', source: 'live', stream_id: 'channel-1' })).toBeNull()
    expect(parseEvent({ name: 'listen_stopped', source: 'live', stream_id: 'channel-1', seconds: 1.5 })).toBeNull()
    expect(parseEvent({ name: 'listen_stopped', source: 'live', stream_id: 'channel-1', seconds: 90_000 })).toBeNull()
    expect(parseEvent({ name: 'audio_progressed', audio_id: 'audio-1', percent: 33 })).toBeNull()
    expect(parseEvent({ name: 'conversion_started', surface: 'give_page', frequency: 'monthly', amount: 50 })).toBeNull()
    expect(parseEvent({ name: 'membership_appeal_shown', appeal_kind: 'membership', surface: 'popup' })).toBeNull()
  })
  it('keeps the counter to placement events only', () => {
    expect(parsePlacementEvent(placement)).toEqual(placement)
    expect(parsePlacementEvent(listen)).toBeNull()
  })
  it('puts placements under counting and the rest under measurement', () => {
    expect(categoryOf(placement)).toBe('counting')
    expect(categoryOf(listen)).toBe('measurement')
    expect(allows(DECLINED, placement)).toBe(true)
    expect(allows(DECLINED, listen)).toBe(false)
    expect(allows(DEFAULT_CONSENT, listen)).toBe(true)
  })
})

describe('consent', () => {
  it('is on with no choice, off with Global Privacy Control, and a recorded choice wins either way', () => {
    expect(effectiveConsent(null, { gpc: false }).measurement).toBe(true)
    expect(effectiveConsent(null, { gpc: true }).measurement).toBe(false)
    expect(effectiveConsent({ measurement: true, personalization: false }, { gpc: true }).measurement).toBe(true)
    expect(effectiveConsent({ measurement: false, personalization: false }, { gpc: false }).measurement).toBe(false)
  })
  it('reads back only what this version stored', () => {
    const text = storedConsentText({ measurement: false, personalization: false }, new Date('2026-11-26T12:00:00Z'))
    expect(parseStoredConsent(text)).toEqual({ measurement: false, personalization: false })
    expect(JSON.parse(text).at).toBe('2026-11-26T12:00:00.000Z')
    for (const bad of [null, '', 'yes', '{"v":2,"measurement":true,"personalization":false}', '{"v":1,"measurement":"yes","personalization":false}', '[]']) {
      expect(parseStoredConsent(bad)).toBeNull()
    }
  })
})

describe('the dispatcher', () => {
  it('sends placements to the counter and everything else to product analytics, never both', () => {
    const counter: AnalyticsEvent[] = []
    const product: AnalyticsEvent[] = []
    const sink = routingSink({ counter: () => ({ send: (e) => counter.push(e) }), product: () => ({ send: (e) => product.push(e) }) })
    const d = createDispatcher({ sink, consent: () => DEFAULT_CONSENT })
    d.track(placement)
    d.track(listen)
    expect(counter).toEqual([placement])
    expect(product).toEqual([listen])
  })
  it('still counts placements after a decline, and sends nothing else', () => {
    const sent: AnalyticsEvent[] = []
    const d = createDispatcher({ sink: { send: (e) => sent.push(e) }, consent: () => DECLINED })
    expect(d.track(placement)).toBe(true)
    expect(d.track(listen)).toBe(false)
    expect(sent).toEqual([placement])
  })
})

function fakePostHog() {
  const calls: string[] = []
  let optedOut = false
  const client = {
    init: vi.fn(() => calls.push('init')),
    capture: vi.fn((name: string) => calls.push(`capture:${name}`)),
    identify: vi.fn((id: string) => calls.push(`identify:${id}`)),
    reset: vi.fn(() => calls.push('reset')),
    register: vi.fn(),
    opt_in_capturing: vi.fn(() => {
      optedOut = false
      calls.push('opt_in')
    }),
    opt_out_capturing: vi.fn(() => {
      optedOut = true
      calls.push('opt_out')
    }),
    has_opted_out_capturing: vi.fn(() => optedOut),
    startSessionRecording: vi.fn(() => calls.push('record')),
    stopSessionRecording: vi.fn(() => calls.push('stop_recording')),
  }
  return { client: client as unknown as PostHogClient, calls }
}

async function setup({ measurement = true, token = 'phc_test' as string | null } = {}) {
  const { client, calls } = fakePostHog()
  const state = { measurement, personalization: false }
  let listener: () => void = () => {}
  const clearStorage = vi.fn()
  const load = vi.fn(async () => client)
  const dest = createPostHogDestination({ token: token ?? undefined, environment: 'test', consent: () => state, subscribe: (l) => ((listener = l), () => {}), load, clearStorage })
  const flush = () => new Promise((r) => setTimeout(r, 0))
  const choose = async (on: boolean) => {
    state.measurement = on
    listener()
    await flush()
  }
  return { dest, calls, load, clearStorage, flush, choose }
}

describe('the PostHog destination', () => {
  it('loads when measurement is on and sends the events held while it loaded, placements never', async () => {
    const { dest, calls, flush } = await setup()
    dest.start()
    dest.sink.send(listen)
    dest.sink.send(placement)
    await flush()
    expect(calls).toEqual(['init', 'capture:listen_started'])
  })
  it('never loads with measurement off or without a token, and clears what PostHog stored', async () => {
    const off = await setup({ measurement: false })
    off.dest.start()
    await off.flush()
    expect(off.load).not.toHaveBeenCalled()
    expect(off.clearStorage).toHaveBeenCalled()
    const none = await setup({ token: null })
    none.dest.start()
    none.dest.sink.send(listen)
    await none.flush()
    expect(none.load).not.toHaveBeenCalled()
  })
  it('stops capturing and recording on a decline, and starts again on an accept', async () => {
    const { dest, calls, flush, choose, clearStorage } = await setup()
    dest.start()
    await flush()
    await choose(false)
    expect(calls.slice(-2)).toEqual(['stop_recording', 'opt_out'])
    expect(clearStorage).toHaveBeenCalled()
    dest.sink.send(listen)
    expect(calls).not.toContain('capture:listen_started')
    await choose(true)
    expect(calls.slice(-2)).toEqual(['opt_in', 'record'])
  })
  it('identifies a reader only with measurement on, and forgets on sign-out', async () => {
    const { dest, calls, flush } = await setup()
    dest.identifyReader('user-1')
    dest.start()
    await flush()
    expect(calls).toContain('identify:user-1')
    dest.resetIdentity()
    expect(calls.at(-1)).toBe('reset')
    const off = await setup({ measurement: false })
    off.dest.start()
    off.dest.identifyReader('user-2')
    await off.flush()
    expect(off.calls).not.toContain('identify:user-2')
  })
  it('finds what PostHog stored by name, on the host and its parents', () => {
    expect(postHogCookieNames('wuwf-consent=1; ph_phc_x_posthog=abc; other=2; __ph_opt_in_out_phc_x=0')).toEqual(['ph_phc_x_posthog', '__ph_opt_in_out_phc_x'])
    expect(isPostHogStorageName('graph_x')).toBe(false)
    expect(cookieDomains('www.wuwf.org')).toEqual(['www.wuwf.org', 'wuwf.org'])
  })
})

describe('the relay', () => {
  it('sends assets to the assets host before the catch-all', () => {
    const rules = posthogRewrites()
    expect(rules.map((r) => r.source)).toEqual([`${RELAY_PATH}/static/:path*`, `${RELAY_PATH}/array/:path*`, `${RELAY_PATH}/:path*`])
    expect(rules[0]!.destination).toContain('us-assets.i.posthog.com')
    expect(rules[2]!.destination).toContain('us.i.posthog.com')
  })
  it('keeps removing a trailing slash everywhere but the relay', () => {
    const source = trailingSlashRedirect().source
    // The pattern Next compiles: `:path(<regex>)` then a slash.
    const inner = source.slice('/:path('.length, source.lastIndexOf(')'))
    const re = new RegExp(`^/${inner}/$`)
    expect(re.test('/news/')).toBe(true)
    expect(re.test('/news/2026-11-26/story/')).toBe(true)
    expect(re.test('/relay/e/')).toBe(false)
    expect(re.test('/')).toBe(false)
  })
})

describe('listening rules', () => {
  it('names the channel live and the track on demand', () => {
    expect(listenRefOf('live', 'channel-1', 'audio-2')).toEqual({ source: 'live', stream_id: 'channel-1' })
    expect(listenRefOf('track', 'channel-1', 'audio-2')).toEqual({ source: 'on_demand', stream_id: 'audio-2' })
    expect(listenRefOf('track', 'channel-1', null)).toBeNull()
    expect(sameListen({ source: 'live', stream_id: 'a' }, { source: 'live', stream_id: 'a' })).toBe(true)
    expect(sameListen({ source: 'live', stream_id: 'a' }, null)).toBe(false)
  })
  it('counts whole seconds within a day', () => {
    expect(listenSeconds(1_000, 96_400)).toBe(95)
    expect(listenSeconds(5_000, 1_000)).toBe(0)
    expect(listenSeconds(0, 200_000_000)).toBe(86_400)
  })
  it('reports each quarter once, and the end within half a second', () => {
    expect(marksReached(30, 100, new Set())).toEqual([25])
    expect(marksReached(80, 100, new Set([25]))).toEqual([50, 75])
    expect(marksReached(99.6, 100, new Set([25, 50, 75]))).toEqual([100])
    expect(marksReached(50, 0, new Set())).toEqual([])
  })
})

describe('engagement rules', () => {
  it('reads a page at three quarters and thirty seconds', () => {
    expect(scrollDepth(0, 800, 4000)).toBe(0.2)
    expect(scrollDepth(0, 800, 600)).toBe(1)
    expect(isRead(0.75, 30_000)).toBe(true)
    expect(isRead(0.9, 29_000)).toBe(false)
    expect(isRead(0.5, 60_000)).toBe(false)
  })
  it('makes a story an episode only when it is a show\'s audio, with ids only', () => {
    expect(storyContentRef({ id: 9, format: 'audio', production: { id: 4 }, categories: [{ id: 7 }, 8] })).toEqual({ content_id: '9', content_kind: 'episode', format: 'audio', show_id: '4', topic_id: '7' })
    expect(storyContentRef({ id: 9, format: 'web', production: 4, categories: [] })).toEqual({ content_id: '9', content_kind: 'story', format: 'web', show_id: '4', topic_id: null })
    expect(showContentRef({ id: 4 })).toEqual({ content_id: '4', content_kind: 'show', format: null, show_id: '4', topic_id: null })
  })
})

describe('the privacy link', () => {
  it('is the footer link that names privacy', () => {
    const page = { id: 1, slug: 'privacy-policy' }
    expect(privacyHrefOf([{ link: { type: 'custom', url: '/eeo', label: 'EEO report' } }, { link: { type: 'reference', reference: { relationTo: 'pages', value: page }, label: 'Privacy' } }] as never)).toBe('/privacy-policy')
    expect(privacyHrefOf([{ link: { type: 'custom', url: 'https://uwf.edu/privacy', label: 'Privacy policy' } }] as never)).toBe('https://uwf.edu/privacy')
    expect(privacyHrefOf([])).toBeNull()
    expect(privacyHrefOf(null)).toBeNull()
  })
})

// A sink type check, so the destination stays a sink.
const _sink: AnalyticsSink = { send: () => {} }
void _sink
