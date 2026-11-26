// Where a visitor's choice is kept: this browser's localStorage, under one key, and nowhere else (never a server, never a cookie, so pages stay
// cached and the server never sees it). Client-only in use; every read and write survives storage being blocked (a private window, a browser
// that refuses site data): the choice then lasts for the page and the default applies on the next.

import { effectiveConsent, type ChosenCategory, type ConsentState, type PrivacySignals } from './consent'

export const CONSENT_KEY = 'wuwf-consent'

/** The stored shape. `v` is the version of the wording the visitor answered; a new version asks again. `at` is when, as an ISO date. */
export interface StoredConsent {
  v: 1
  measurement: boolean
  personalization: boolean
  at: string
}

export const CONSENT_VERSION = 1

/** The stored choice, if the text is one this version wrote; anything else (old, broken, hand-edited) is no choice. Pure. */
export function parseStoredConsent(text: string | null | undefined): ConsentState {
  if (!text) return null
  try {
    const v = JSON.parse(text) as Partial<StoredConsent> | null
    if (!v || typeof v !== 'object' || v.v !== CONSENT_VERSION) return null
    if (typeof v.measurement !== 'boolean' || typeof v.personalization !== 'boolean') return null
    return { measurement: v.measurement, personalization: v.personalization }
  } catch {
    return null
  }
}

/** The text to store for a choice. Pure. */
export function storedConsentText(choice: Readonly<Record<ChosenCategory, boolean>>, at: Date): string {
  const stored: StoredConsent = { v: CONSENT_VERSION, measurement: choice.measurement, personalization: choice.personalization, at: at.toISOString() }
  return JSON.stringify(stored)
}

// A choice made while storage is blocked lives here for the rest of the page (and only then: stored choices are read from storage).
let memory: ConsentState = null
const listeners = new Set<() => void>()

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** The visitor's recorded choice, or null if they have made none. */
export function readConsent(): ConsentState {
  try {
    return parseStoredConsent(storage()?.getItem(CONSENT_KEY)) ?? memory
  } catch {
    return memory
  }
}

/** Record a choice and tell everyone listening (the banner, the PostHog loader). */
export function writeConsent(choice: Readonly<Record<ChosenCategory, boolean>>): void {
  memory = null
  try {
    const store = storage()
    if (!store) throw new Error('no storage')
    store.setItem(CONSENT_KEY, storedConsentText(choice, new Date()))
  } catch {
    // Storage refused: the choice holds for this page only.
    memory = { measurement: choice.measurement, personalization: choice.personalization }
  }
  notify()
}

function notify() {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // A listener's failure is its own.
    }
  }
}

/** Call `listener` when the choice changes here or in another tab. Returns the way to stop. */
export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === CONSENT_KEY) listener()
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}

/** What the browser itself says: Global Privacy Control. */
export function privacySignals(): PrivacySignals {
  try {
    return { gpc: typeof navigator !== 'undefined' && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true }
  } catch {
    return { gpc: false }
  }
}

/** The consent that applies right now in this browser. */
export const currentConsent = () => effectiveConsent(readConsent(), privacySignals())
