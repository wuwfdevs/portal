// What a visitor has agreed to, and which events that lets the site send. Pure: storing the choice and asking for it are not built yet.
//
// Three categories need a choice (`ANALYTICS.md`, "Consent"): measurement, personalization, and the always-on necessary, which is never
// analytics. Until a visitor has made a choice, nothing in them is sent. There is no consent banner yet, so today none of them is sent.
//
// **Counting** is the exception, and is provisional (owner, 2026-11-25: "assume no consent for now"). The sponsor placement counts store no
// cookie, no identifier and no address: each event adds one to a daily total and is gone (`ANALYTICS.md`, "The placement counter"), so they are
// treated as not needing consent until counsel answers. If counsel says they do, change `categoryOf` to put them under measurement; nothing
// else changes.

import type { AnalyticsEvent } from './events'

export type ConsentCategory = 'counting' | 'measurement' | 'personalization'

/** The categories a visitor chooses. Counting is not one of them. */
export type ChosenCategory = Exclude<ConsentCategory, 'counting'>

/** The visitor's choice; null until one is made. */
export type ConsentState = Readonly<Record<ChosenCategory, boolean>> | null

/** The category an event belongs to. */
export function categoryOf(event: AnalyticsEvent): ConsentCategory {
  switch (event.name) {
    case 'sponsor_placement_measurable':
    case 'sponsor_placement_viewable':
    case 'sponsor_placement_clicked':
      return 'counting'
  }
}

/** Whether the visitor's choice lets this event be sent. Counting needs no choice; everything else needs a yes. */
export function allows(consent: ConsentState, event: AnalyticsEvent): boolean {
  const category = categoryOf(event)
  if (category === 'counting') return true
  return consent !== null && consent[category] === true
}
