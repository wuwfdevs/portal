// The sink that sends placement events to the site's own counter (`/api/placement-counts`). Browser only, and nothing else.
//
// Events wait in a short queue and go in one post: when the page is hidden or left (the last chance to send), or a few seconds after the first
// event of a batch. The post is `navigator.sendBeacon` (it survives the page closing and never delays navigation), else a `fetch` with
// `keepalive`. A post that fails is dropped: a count is never retried, so it can never be counted twice. Nothing about the visitor is added.

import type { AnalyticsSink } from './dispatch'
import type { AnalyticsEvent } from './events'
import { MAX_EVENTS } from './filter'

export const COUNTER_PATH = '/api/placement-counts'
export const BATCH_WAIT_MS = 5000

export interface BeaconDeps {
  /** Sends the body; returns false when the browser refused it. */
  post: (url: string, body: string) => boolean
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (timer: unknown) => void
  /** Calls `fn` when the page is hidden or being left. */
  onLeave: (fn: () => void) => void
}

/** A sink over the given browser functions; `browserBeaconSink` is the real one. Exported for tests. */
export function createBeaconSink(deps: BeaconDeps): AnalyticsSink & { flush(): void } {
  let queue: AnalyticsEvent[] = []
  let timer: unknown = null

  const flush = () => {
    if (timer !== null) deps.clearTimer(timer)
    timer = null
    while (queue.length > 0) {
      const batch = queue.slice(0, MAX_EVENTS)
      queue = queue.slice(MAX_EVENTS)
      try {
        deps.post(COUNTER_PATH, JSON.stringify({ events: batch }))
      } catch {
        // Dropped on purpose (see above).
      }
    }
  }
  deps.onLeave(flush)

  return {
    send(event) {
      queue.push(event)
      if (queue.length >= MAX_EVENTS) flush()
      else if (timer === null) timer = deps.setTimer(flush, BATCH_WAIT_MS)
    },
    flush,
  }
}

function post(url: string, body: string): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    // text/plain keeps the post simple (no preflight); the counter reads the body as text either way.
    if (navigator.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return true
  }
  if (typeof fetch === 'function') {
    void fetch(url, { method: 'POST', body, keepalive: true, credentials: 'omit', headers: { 'content-type': 'text/plain;charset=UTF-8' } }).catch(() => {})
    return true
  }
  return false
}

/** The real sink, or null outside a browser (the server never sends events). */
export function browserBeaconSink(): AnalyticsSink | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  return createBeaconSink({
    post,
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (t) => window.clearTimeout(t as number),
    onLeave: (fn) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') fn()
      })
      window.addEventListener('pagehide', fn)
    },
  })
}
