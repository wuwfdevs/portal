/**
 * The privacy wording for the site's analytics, kept beside the behaviour it describes so the two change together (a sentence here that no
 * longer matches `posthog.ts`, `consent.ts` or `consent-store.ts` is a false notice). Pure: no React, no Payload.
 *
 * `BANNER_*` and `SETTINGS_*` are what the consent banner and its settings say (`components/ConsentBanner`). `PRIVACY_PAGE_PARAGRAPHS` is the
 * text for the site's privacy notice page (a Page edited in the admin), beside the search wording in `lib/embeddings/notice.ts`.
 *
 * **Open:** this wording has not been through the university's privacy review or checked against the UWF IT-04 notice (`ANALYTICS.md`,
 * "Open questions"). Change it here when it has.
 *
 * What the wording promises is what the code does:
 * - Measurement is on until the visitor turns it off (`DEFAULT_CONSENT`); a browser sending Global Privacy Control starts with it off.
 * - Measurement is PostHog (US Cloud), reached through this site's own address; it sets cookies and local storage, records page views, clicks,
 *   time on page, the site's listening, reading and giving events, script errors, and session replays with every typed value masked.
 *   PostHog receives the visitor's IP address with each request and uses it for an approximate location.
 * - Declining stops PostHog at once and removes what it stored; the choice is kept in this browser only (`wuwf-consent`).
 * - Sponsor placement counts are not part of it: daily totals, no cookie, no identifier (`ANALYTICS.md`, "The placement counter").
 * - A signed-in reader's visits are tied to their account id, never their email, membership or giving records.
 */

export const BANNER_LABEL = 'How WUWF.org measures visits'

export const BANNER_TEXT =
  'We use cookies and PostHog, an analytics service, to see how people use WUWF.org: which pages and stories are read, what is listened to, and where the site gets in the way. You can turn this off at any time.'

export const SETTINGS_TITLE = 'Privacy settings'

export const SETTINGS_INTRO =
  'Choose what WUWF.org may measure in this browser. Your choice is saved in this browser only, and you can change it any time from “Privacy settings” at the foot of every page.'

export const MEASUREMENT_LABEL = 'Analytics'

export const MEASUREMENT_DESCRIPTION =
  'Page views, clicks, listening and reading, recordings of how pages are used (with anything you type hidden), and errors, through PostHog. It uses cookies.'

export const ALWAYS_ON_LABEL = 'Always on'

export const ALWAYS_ON_DESCRIPTION =
  'What the site needs to work, and a daily count of how often each sponsor message was seen and clicked. That count sets no cookie and keeps nothing about you.'

export const GPC_NOTE = 'Your browser asks sites not to track you (Global Privacy Control), so analytics starts off here.'

export const PRIVACY_PAGE_HEADING = 'How we measure visits'

export const PRIVACY_PAGE_PARAGRAPHS: readonly string[] = [
  'WUWF.org uses PostHog, an analytics service, to understand how the site is used: which pages and stories people read, what they listen to on the site’s player, which requests for support they see and follow, how long pages take to load, and where the site fails or gets in the way.',
  'To do this, PostHog stores a random identifier in a cookie and in your browser’s local storage, so that one visit can be told from another. It records the pages you view, the links and buttons you click, how long you stay, the site that sent you, your browser and device, and errors on the page. It also records how pages are used (mouse movement, scrolling and clicks) so that staff can replay a visit and see where it went wrong; anything you type into a form is hidden in those recordings. PostHog receives your IP address with each request and uses it to estimate your approximate location.',
  'The data goes to PostHog’s United States service, through WUWF.org’s own address. If you sign in to a WUWF.org account, your visits are linked to that account’s identifier, never to your email address, your membership or your gifts.',
  'Analytics is on unless you turn it off. Choose “Decline” on the notice, or “Privacy settings” at the foot of any page, at any time. Turning it off stops PostHog straight away and removes what it stored in your browser; your choice is saved in your browser only. If your browser sends a Global Privacy Control signal, analytics starts off.',
  'Separately, the site counts how often each sponsor message is shown and clicked, as daily totals for each message. That count sets no cookie and keeps no identifier, address or page, and it is not affected by your analytics choice.',
]
