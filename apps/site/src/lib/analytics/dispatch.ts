// The one door every analytics event goes through: checked (`events.ts`), held to the visitor's choice (`consent.ts`), then handed to a sink.
//
// A sink is where events go. The only one today is `noopSink`, which sends nothing: the collection endpoint is not built (`ANALYTICS.md`,
// "Order of work"). Components call `track` and never a vendor, so the sink can change without touching them. Tracking never throws and
// never changes what the page does: a sink that fails is ignored.

import { allows, type ConsentState } from './consent'
import { parseEvent, type AnalyticsEvent } from './events'

export interface AnalyticsSink {
  send(event: AnalyticsEvent): void
}

/** Sends nothing. What the site uses until the collection endpoint exists. */
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

/** The site's dispatcher. No consent is ever recorded yet and the sink sends nothing, so this sends nothing. */
export const analytics: Dispatcher = createDispatcher({ sink: noopSink, consent: () => null })
