// What the placement counter accepts. Pure: the route hands it the request's headers and body text, and gets back the events to count.
//
// These rules decide what a sponsor's report counts, so they are versioned: `FILTER_VERSION` is stored on every daily total and printed on every
// report. Change a rule, change the version (the date and a number), and add a line to `FILTER_RULES`, which the report prints.
//
// It is a filter, not a lock. Anyone can post anything; these rules keep out what is plainly not a person reading a page (automated clients,
// other sites, malformed or oversized posts, repeats within one post). What it does not do yet, and the report says so: data-center address
// ranges and rate limits, which need the address, and the address is never kept.

import { parsePlacementEvent, type PlacementEvent } from './events'

export const FILTER_VERSION = '2026-11-25.1'
export const MAX_EVENTS = 20
export const MAX_BODY_BYTES = 4096

/** The rules, in words, for the report. */
export const FILTER_RULES: readonly string[] = [
  'Only posts from this site\'s own pages (same origin) are counted.',
  'Posts from known automated clients (crawlers, link previews, headless browsers, monitoring) or with no browser identification are not counted.',
  `A post holds at most ${MAX_EVENTS} events, each one well formed (placement and sponsor ids, a known place on the site), and is at most ${MAX_BODY_BYTES / 1024} KB.`,
  'An event for a placement that is not switched on, or that names the wrong place or sponsor, is not counted.',
  'Within one post, each kind of event is counted at most once per placement.',
  'Not yet applied: data-center address ranges and per-address rate limits (the address is never stored).',
]

/** Automated clients, by what they call themselves. Deliberately broad: a missed bot inflates a sponsor's numbers, a missed person only lowers them. */
const BOT =
  /bot\b|bot\/|crawl|spider|slurp|scrape|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|headless|phantomjs|puppeteer|playwright|selenium|lighthouse|pagespeed|pingdom|uptime|monitor|statuscake|curl\/|wget\/|python-|python\/|httpx|aiohttp|go-http-client|java\/|okhttp|axios\/|node-fetch|undici|postman|insomnia|libwww|httpclient/i

/** Whether the user agent is a browser a person might be using. */
export function isHumanAgent(userAgent: string | null | undefined): boolean {
  const ua = userAgent?.trim() ?? ''
  if (ua.length < 20 || !/^Mozilla\/5\.0 /.test(ua)) return false
  return !BOT.test(ua)
}

/** Whether the post came from this site's own page: the browser's Origin, or its Sec-Fetch-Site, says so. */
export function isSameOrigin(headers: { origin: string | null; secFetchSite: string | null }, siteOrigin: string): boolean {
  if (headers.secFetchSite && headers.secFetchSite !== 'same-origin') return false
  if (headers.origin) return headers.origin === siteOrigin
  return headers.secFetchSite === 'same-origin'
}

export interface CollectInput {
  userAgent: string | null
  origin: string | null
  secFetchSite: string | null
  /** The site's own origin, e.g. `https://wuwf.org`. */
  siteOrigin: string
  body: string
}

/** The events in a post that may be counted, or an empty list. Never throws. */
export function acceptedEvents(input: CollectInput): PlacementEvent[] {
  if (!isSameOrigin(input, input.siteOrigin) || !isHumanAgent(input.userAgent)) return []
  if (input.body.length === 0 || new TextEncoder().encode(input.body).length > MAX_BODY_BYTES) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(input.body)
  } catch {
    return []
  }
  const list = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as { events?: unknown }).events : null
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_EVENTS) return []
  const seen = new Set<string>()
  const out: PlacementEvent[] = []
  for (const item of list) {
    const event = parsePlacementEvent(item)
    if (!event) continue
    const key = `${event.name}|${event.placement_id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(event)
  }
  return out
}
