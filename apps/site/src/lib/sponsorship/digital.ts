// Digital placements (board 18). Fixed, labeled, sold directly: no leaderboards, no autoplay, no pop-ups, no third-party tracking.
// A placement without a confirmed size or rate is left out of the public page rather than shown as a bracket
// (the board's website "Banner" row: its format and rate are still to be confirmed, and the site has no top-of-page leaderboard).

import { formatMoney } from './money'

/** Digital rates in cents. The page's prices, the goals' examples and the package arithmetic all read these. */
export const WEBSITE_MONTH_CENTS = 20000
export const APP_BANNER_MONTH_CENTS = 15000
export const APP_DOUBLE_BANNER_MONTH_CENTS = 20000
export const APP_PRE_ROLL_MONTH_CENTS = 20000
export const NEWSLETTER_ISSUE_CENTS = 10000
/** One banner in the app, a display ad on the website and a message in one issue of the e-newsletter, together. */
export const DIGITAL_PACKAGE_CENTS = 40000
export const DIGITAL_SEPARATE_CENTS = WEBSITE_MONTH_CENTS + APP_BANNER_MONTH_CENTS + NEWSLETTER_ISSUE_CENTS

export type Placement = { key: string; name: string; detail: string; size: string; price: string }

export const WEBSITE_PLACEMENTS: readonly Placement[] = [
  { key: 'website-display', name: 'Display ad', detail: 'A tile ad that appears on the website and on mobile devices.', size: '', price: `${formatMoney(WEBSITE_MONTH_CENTS)} a month` },
]

export const APP_PLACEMENTS: readonly Placement[] = [
  { key: 'app-single-banner', name: 'Single banner', detail: 'A banner in the WUWF app.', size: '640 × 100', price: `${formatMoney(APP_BANNER_MONTH_CENTS)} a month, or ${formatMoney(APP_BANNER_MONTH_CENTS * 3)} for 3 months` },
  { key: 'app-double-banner', name: 'Double banner', detail: 'A taller banner in the WUWF app.', size: '640 × 200', price: `${formatMoney(APP_DOUBLE_BANNER_MONTH_CENTS)} a month, or ${formatMoney(APP_DOUBLE_BANNER_MONTH_CENTS * 3)} for 3 months` },
  { key: 'app-pre-roll', name: 'Pre-roll', detail: 'A 10-second message on the phone screen before the live stream.', size: '640 × 1136', price: `${formatMoney(APP_PRE_ROLL_MONTH_CENTS)} a month` },
]

export const NEWSLETTER_AND_AUDIO_PLACEMENTS: readonly Placement[] = [
  { key: 'newsletter-message', name: 'E-newsletter message', detail: 'A labeled sponsor message in one issue of the e-newsletter, which is delivered to WUWF members.', size: '', price: `${formatMoney(NEWSLETTER_ISSUE_CENTS)} an issue` },
  { key: 'stream-pre-roll', name: 'Stream audio pre-roll', detail: 'A 15-second audio message before the live stream in the apps, with a linked tile ad.', size: 'Audio, 15 seconds', price: 'Ask for rates' },
  { key: 'podcast-spot', name: 'Podcast spot', detail: 'An audio spot before, in the middle of, or at the end of a podcast.', size: 'Audio', price: 'Ask for rates' },
]

export const DIGITAL_RULES: readonly { heading: string; text: string }[] = [
  { heading: 'Always labeled', text: 'Every placement says “Sponsor message” and follows WUWF’s credit guidelines, so readers know who supports WUWF.' },
  { heading: 'Your own spot, sold directly', text: 'Your message appears in the same place every time, sold by WUWF’s team, not an ad network.' },
  { heading: 'Nothing competes with it', text: 'No autoplay, no pop-ups, and no sound or motion you didn’t ask for.' },
  { heading: 'No third-party tracking', text: 'Sponsor placements add no outside trackers to the page.' },
]
