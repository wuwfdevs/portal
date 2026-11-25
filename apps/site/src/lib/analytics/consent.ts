// What a visitor has agreed to, and which events that lets the site send. Pure: storing the choice and asking for it are not built yet.
//
// Three categories (`ANALYTICS.md`, "Consent"): necessary (always on, and never analytics), measurement (the events in `events.ts`) and
// personalization. Until a visitor has made a choice, nothing is sent. There is no consent banner yet, so today nothing is sent at all.
//
// Open for counsel: whether a sponsor count that stores no cookie, no identifier and no address may run without consent. Until that is
// answered, placement events are measurement like everything else.

import type { AnalyticsEvent } from './events'

export type ConsentCategory = 'measurement' | 'personalization'

/** The visitor's choice; null until one is made. */
export type ConsentState = Readonly<Record<ConsentCategory, boolean>> | null

/** The category an event belongs to. */
export function categoryOf(event: AnalyticsEvent): ConsentCategory {
  switch (event.name) {
    case 'sponsor_placement_measurable':
    case 'sponsor_placement_viewable':
    case 'sponsor_placement_clicked':
      return 'measurement'
  }
}

/** Whether the visitor's choice lets this event be sent. No choice means no. */
export const allows = (consent: ConsentState, event: AnalyticsEvent): boolean => consent !== null && consent[categoryOf(event)] === true
