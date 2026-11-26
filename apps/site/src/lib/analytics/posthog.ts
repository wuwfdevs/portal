// PostHog, the site's product-analytics destination (owner, 2026-11-26; `ANALYTICS.md`, "PostHog"). The only file that imports `posthog-js`.
//
// What it measures on its own, once loaded: page views (each address change, `defaults`), time on page, where a visit came from, device and
// rough place, clicks on links and buttons (autocapture), session replays with every typed value masked, and script errors. The site's own
// events (listening, content, giving) come through `analytics.track` and the sink below, never from a component calling PostHog.
//
// Held to the visitor's choice (`consent.ts`): it loads only while measurement is on, stops capturing and recording the moment it is turned
// off, removes the cookies and storage it wrote, and starts again if it is turned back on. Nothing here throws or delays the page: a failed
// load leaves the site exactly as it was.

import type { CaptureResult, PostHog, PostHogConfig } from 'posthog-js'

import type { ChosenCategory } from './consent'
import type { AnalyticsSink } from './dispatch'
import { isPlacementEvent, type AnalyticsEvent } from './events'
import { POSTHOG_UI_HOST, RELAY_PATH } from './posthog-config'

/** The part of PostHog the site uses, so tests can stand in for it. */
export type PostHogClient = Pick<
  PostHog,
  'init' | 'capture' | 'identify' | 'reset' | 'register' | 'opt_in_capturing' | 'opt_out_capturing' | 'has_opted_out_capturing' | 'startSessionRecording' | 'stopSessionRecording'
>

/**
 * Text the replay never shows: a listening answer, an account's details. Mark an element with `data-ph-mask` (its text is replaced) or the class
 * `ph-no-capture` (left out of the replay and of autocapture altogether). Typed values are masked everywhere already (`maskAllInputs`).
 */
export const MASK_SELECTOR = '[data-ph-mask]'

/** How PostHog is started. `environment` tells production from staging and local in every event. */
export function posthogOptions(environment: string): Partial<PostHogConfig> {
  return {
    api_host: RELAY_PATH,
    ui_host: POSTHOG_UI_HOST,
    // PostHog's dated defaults: page views on every address change (the site moves between pages without reloading), page leave, and the
    // other current defaults. A date, not 'latest', so an SDK update never changes what is collected without a commit.
    defaults: '2026-08-30',
    // A person profile only for a reader who signs in (`identifyReader`); everyone else is an anonymous visitor.
    person_profiles: 'identified_only',
    autocapture: true,
    capture_exceptions: true,
    session_recording: { maskAllInputs: true, maskTextSelector: MASK_SELECTOR },
    // Addresses that carry a secret (a membership claim link, a listening table's link) never reach PostHog: every event, replay snapshots
    // included, is passed through `redactEvent` before it is sent.
    before_send: (event) => redactEvent(event),
    loaded: (ph) => {
      ph.register({ environment })
    },
  }
}

/**
 * Addresses whose parts are secrets: a membership claim's `?token=`, a sign-in page's `?next=` (which can hold a claim link), and the token
 * in a listening table's address (`/listens/table/<token>`). Possession of a claim token attaches a membership to an account
 * (`lib/members/claim.ts`), so it must never sit in an analytics property, a link's address in autocapture or a replay's page address.
 */
const SECRET_QUERY = /([?&](?:token|next)=)[^&#\s"']*/gi
const SECRET_PATH = /(\/listens\/table\/)[^/?#\s"']+/gi
export const REDACTED = 'redacted'

/** The text with every secret part of an address in it replaced. Pure. */
export function redactText(text: string): string {
  if (!/(token|next)=|\/listens\/table\//i.test(text)) return text
  return text.replace(SECRET_QUERY, `$1${REDACTED}`).replace(SECRET_PATH, `$1${REDACTED}`)
}

/** A copy of a value with `redactText` applied to every string in it, however deep (properties, `$set`, autocapture's elements, replay data). */
export function redactValue<T>(value: T, depth = 0): T {
  if (typeof value === 'string') return redactText(value) as T
  if (depth > 40 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1)) as T
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactValue(v, depth + 1)
  return out as T
}

/** PostHog's `before_send`: the event with secrets in addresses redacted. Never drops an event, and never throws (a failure drops it). */
export function redactEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event
  try {
    return { ...event, properties: redactValue(event.properties), $set: redactValue(event.$set), $set_once: redactValue(event.$set_once) }
  } catch {
    return null
  }
}

/**
 * Names PostHog writes to cookies and storage (`ph_<token>_posthog` and the like), which a decline removes. Not its opt-out marker
 * (`__ph_opt_in_out_<token>`): `opt_out_capturing()` writes it, and PostHog reads it to keep capture off, so removing it would let page views
 * and autocapture resume in the same page after a decline. Pure.
 */
export const isPostHogStorageName = (name: string): boolean => /(^|_)ph_/.test(name) && !/_opt_in_out_/.test(name)

/** The cookie names in a `document.cookie` string that PostHog wrote. Pure. */
export function postHogCookieNames(cookieString: string): string[] {
  return cookieString
    .split(';')
    .map((part) => part.split('=')[0]?.trim() ?? '')
    .filter((name) => name !== '' && isPostHogStorageName(name))
}

/** The domains a cookie for this host may have been set on: the host and each parent (PostHog sets one for the whole site). Pure. */
export function cookieDomains(hostname: string): string[] {
  const parts = hostname.split('.')
  const out: string[] = []
  for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join('.'))
  return out
}

/** Remove what PostHog stored in this browser. Called when measurement is off, so a declined visitor keeps nothing of ours but the choice. */
export function clearPostHogStorage(): void {
  try {
    for (const name of postHogCookieNames(document.cookie)) {
      const expire = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
      document.cookie = expire
      for (const domain of cookieDomains(location.hostname)) document.cookie = `${expire}; domain=.${domain}`
    }
    for (const store of [window.localStorage, window.sessionStorage]) {
      for (const key of Object.keys(store)) if (isPostHogStorageName(key)) store.removeItem(key)
    }
  } catch {
    // Storage blocked: there is nothing of ours in it.
  }
}

type Consent = () => Readonly<Record<ChosenCategory, boolean>>

export interface PostHogDestination {
  /** Load PostHog if measurement is on, and follow the visitor's choice from now on. Safe to call more than once. */
  start(): void
  /** The sink for the site's own measurement events. Placement events are never sent to PostHog. */
  sink: AnalyticsSink
  /** A reader signed in: tie this browser's visits to their account id (the Supabase user id; never an email, never a member or donor id). */
  identifyReader(userId: string): void
  /** A reader signed out: forget who this browser was. */
  resetIdentity(): void
}

/** Events held while PostHog loads, at most this many; the rest are dropped rather than queued without end. */
const MAX_WAITING = 50

/** The PostHog destination, with its parts passed in so tests can drive it without a browser or a network. */
export function createPostHogDestination({
  token,
  environment,
  consent,
  subscribe,
  load,
  clearStorage,
}: {
  token: string | undefined
  environment: string
  consent: Consent
  subscribe: (listener: () => void) => () => void
  load: () => Promise<PostHogClient>
  clearStorage: () => void
}): PostHogDestination {
  let client: PostHogClient | null = null
  let loading = false
  let started = false
  let waiting: AnalyticsEvent[] = []
  let pendingIdentity: string | null = null
  const on = () => consent().measurement === true

  const capture = (ph: PostHogClient, event: AnalyticsEvent) => {
    const { name, ...properties } = event
    ph.capture(name, properties)
  }

  const ready = (ph: PostHogClient) => {
    client = ph
    // A visitor who turned measurement off and later back on: PostHog may still hold its own opt-out from then.
    if (on() && ph.has_opted_out_capturing()) ph.opt_in_capturing()
    if (!on()) return follow()
    for (const event of waiting) capture(ph, event)
    waiting = []
    if (pendingIdentity) ph.identify(pendingIdentity)
    pendingIdentity = null
  }

  const ensureLoaded = () => {
    if (client || loading || !token) return
    loading = true
    load()
      .then((ph) => {
        ph.init(token, posthogOptions(environment))
        ready(ph)
      })
      .catch(() => {
        // PostHog could not load (blocked, offline): the site carries on without it.
        waiting = []
      })
      .finally(() => {
        loading = false
      })
  }

  // Whether PostHog was last told to capture: it is told again only on a real change, so an Accept while already on sends no second opt-in.
  let capturing = true

  /** Bring PostHog in line with the current choice. */
  const follow = () => {
    try {
      if (on()) {
        if (!client) ensureLoaded()
        else if (!capturing) {
          // Back on after a decline in this page: PostHog was told to stop recording, so it is told to start again.
          client.opt_in_capturing()
          client.startSessionRecording()
        }
        capturing = true
        return
      }
      capturing = false
      waiting = []
      pendingIdentity = null
      if (client) {
        client.stopSessionRecording()
        client.opt_out_capturing()
      }
      clearStorage()
    } catch {
      // Never let analytics break the page.
    }
  }

  return {
    start() {
      if (started || !token) return
      started = true
      subscribe(follow)
      follow()
    },
    sink: {
      send(event) {
        if (!token || isPlacementEvent(event) || !on()) return
        if (client) capture(client, event)
        else if (waiting.length < MAX_WAITING) waiting.push(event)
      },
    },
    identifyReader(userId) {
      if (!token || !on()) return
      if (client) client.identify(userId)
      else pendingIdentity = userId
    },
    resetIdentity() {
      pendingIdentity = null
      try {
        client?.reset()
      } catch {
        // Nothing to forget.
      }
    },
  }
}
