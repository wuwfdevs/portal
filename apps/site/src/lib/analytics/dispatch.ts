// The one door every analytics event goes through: checked (`events.ts`), held to the visitor's choice (`consent.ts`), then handed to a sink.
//
// A sink is where events go. In the browser it is the site's own counter (`beacon.ts`, `/api/placement-counts`); on the server, where nothing
// is ever sent, it is `noopSink`. Components call `track` and never a vendor, so the sink can change without touching them. Tracking never
// throws and never changes what the page does: a sink that fails is ignored.

import { browserBeaconSink } from './beacon'
import { allows, type ConsentState } from './consent'
import { parseEvent, type AnalyticsEvent } from './events'

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

/**
 * The site's dispatcher. No visitor's choice is recorded yet (there is no consent banner), so only the events that need none are sent: the
 * sponsor placement counts (`consent.ts`, "counting"). The sink is made on first use, in the browser.
 */
let sink: AnalyticsSink | null = null
const lazySink: AnalyticsSink = {
  send(event) {
    sink ??= browserBeaconSink() ?? noopSink
    sink.send(event)
  },
}
export const analytics: Dispatcher = createDispatcher({ sink: lazySink, consent: () => null })
