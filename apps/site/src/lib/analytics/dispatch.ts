// The one door every analytics event goes through: checked (`events.ts`), held to the visitor's choice (`consent.ts`), then handed to a sink.
//
// A sink is where events go. Each event goes to exactly one destination, by kind: the sponsor placement events to the site's own counter
// (`beacon.ts`, `/api/placement-counts`), never to a vendor, so a sponsor's figures never depend on one; every other event to PostHog
// (`posthog.ts`). On the server nothing is ever sent (`noopSink`). Components call `track` and never a vendor, so a destination can change
// without touching them. Tracking never throws and never changes what the page does: a sink that fails is ignored.

import { browserBeaconSink } from './beacon'
import { allows, type ConsentState } from './consent'
import { currentConsent, readConsent, subscribeConsent } from './consent-store'
import { isPlacementEvent, parseEvent, type AnalyticsEvent } from './events'
import { clearPostHogStorage, createPostHogDestination, type PostHogClient } from './posthog'

export interface AnalyticsSink {
  send(event: AnalyticsEvent): void
}

/** Sends nothing: the sink on the server, and in tests. */
export const noopSink: AnalyticsSink = { send: () => {} }

export interface Dispatcher {
  /** Send the event if it is well formed and the visitor's choice allows it. Returns whether it was handed to the sink. */
  track(event: AnalyticsEvent): boolean
}

export function createDispatcher({ sink, consent }: { sink: AnalyticsSink; consent: () => ConsentState }): Dispatcher {
  return {
    track(event) {
      try {
        const checked = parseEvent(event)
        if (!checked || !allows(consent(), checked)) return false
        sink.send(checked)
        return true
      } catch {
        return false
      }
    },
  }
}

/** One sink that hands each event to the destination for its kind: placements to the counter, the rest to product analytics. */
export function routingSink({ counter, product }: { counter: () => AnalyticsSink; product: () => AnalyticsSink }): AnalyticsSink {
  return {
    send(event) {
      ;(isPlacementEvent(event) ? counter() : product()).send(event)
    },
  }
}

/** PostHog for this site: configured by `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`; without it nothing loads and no banner is shown. */
export const posthog = createPostHogDestination({
  token: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || undefined,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'development',
  consent: currentConsent,
  subscribe: subscribeConsent,
  load: () => import('posthog-js').then((m) => m.default as PostHogClient),
  clearStorage: clearPostHogStorage,
})

/** Whether PostHog is set up for this deployment, so the banner and the privacy settings have something to ask about. */
export const productAnalyticsConfigured = (): boolean => Boolean(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN)

/** The site's dispatcher. The sinks are made on first use, in the browser; the choice is read at each event. */
let counter: AnalyticsSink | null = null
const sink = routingSink({
  counter: () => (counter ??= browserBeaconSink() ?? noopSink),
  product: () => (typeof window === 'undefined' ? noopSink : posthog.sink),
})
export const analytics: Dispatcher = createDispatcher({
  sink,
  // Counting needs no choice; everything else follows the recorded choice or the default (`effectiveConsent`).
  consent: () => (typeof window === 'undefined' ? readConsent() : currentConsent()),
})

