// What a visitor has agreed to, and which events that lets the site send. Pure: the stored choice is `consent-store.ts`, the banner
// `components/ConsentBanner`.
//
// **Measurement is on until the visitor turns it off** (owner, 2026-11-26, replacing "consent first": `ANALYTICS.md`, "Consent"). The banner
// is a notice with Accept, Decline and Settings; a recorded choice always wins, and a browser that sends Global Privacy Control with no choice
// recorded is treated as having declined. Personalization is a category with nothing in it yet; it stays off until something uses it and asks.
//
// **Counting** needs no choice, provisionally (owner, 2026-11-25: "assume no consent for now"). The sponsor placement counts store no cookie,
// no identifier and no address: each event adds one to a daily total and is gone (`ANALYTICS.md`, "The placement counter"). If counsel says
// they need a choice, change `categoryOf` to put them under measurement; nothing else changes. Declining measurement does not stop them.

import type { AnalyticsEvent } from './events'

export type ConsentCategory = 'counting' | 'measurement' | 'personalization'

/** The categories a visitor chooses. Counting is not one of them. */
export type ChosenCategory = Exclude<ConsentCategory, 'counting'>

/** The visitor's choice; null until one is made. */
export type ConsentState = Readonly<Record<ChosenCategory, boolean>> | null

/** What the browser says on its own about tracking. `gpc` is `navigator.globalPrivacyControl`. */
export interface PrivacySignals {
  gpc: boolean
}

/** What applies with no choice recorded: measurement on (a notice, not an opt-in), personalization off. */
export const DEFAULT_CONSENT: Readonly<Record<ChosenCategory, boolean>> = { measurement: true, personalization: false }

/** What applies with no choice recorded and Global Privacy Control on: nothing that needs a choice. */
export const DECLINED: Readonly<Record<ChosenCategory, boolean>> = { measurement: false, personalization: false }

/** What applies now: the recorded choice if there is one, else the default, which Global Privacy Control turns off. Never null. */
export function effectiveConsent(stored: ConsentState, signals: PrivacySignals): Readonly<Record<ChosenCategory, boolean>> {
  if (stored) return stored
  return signals.gpc ? DECLINED : DEFAULT_CONSENT
}

/** The category an event belongs to. */
export function categoryOf(event: AnalyticsEvent): ConsentCategory {
  switch (event.name) {
    case 'sponsor_placement_measurable':
    case 'sponsor_placement_viewable':
    case 'sponsor_placement_clicked':
      return 'counting'
    case 'listen_started':
    case 'listen_stopped':
    case 'audio_progressed':
    case 'content_viewed':
    case 'content_engaged':
    case 'membership_appeal_shown':
    case 'membership_appeal_clicked':
    case 'conversion_started':
      return 'measurement'
  }
}

/** Whether this consent lets the event be sent. Counting needs no choice; everything else needs its category on. */
export function allows(consent: ConsentState, event: AnalyticsEvent): boolean {
  const category = categoryOf(event)
  if (category === 'counting') return true
  return consent !== null && consent[category] === true
}
