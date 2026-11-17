// "Start with your goal" (board 16). Each goal is a short example schedule, not an offer: corporate support tailors every one.
// Totals that restate a package or a rate are built from `packages.ts` and `rates.ts`, so a rate change cannot leave a goal behind.

import { formatMoney, percentOff } from './money'
import { APP_BANNER_MONTH_CENTS, DIGITAL_PACKAGE_CENTS, DIGITAL_SEPARATE_CENTS, NEWSLETTER_ISSUE_CENTS, WEBSITE_MONTH_CENTS } from './digital'
import { CARPOOL, DRIVE_TIME_OPEN_CENTS, NEW_SPONSOR_DRIVE_CENTS, newSponsorPackage, packagePrice, savings } from './packages'
import { NONPROFIT_PERCENT, DAYPARTS, rateCents } from './rates'

export type GoalLine = { channel: string; what: string; detail: string; price: string }

export type Goal = {
  key: string
  name: string
  title: string
  lead: string
  total: string
  span: string
  mix: readonly GoalLine[]
}

const tpr = DAYPARTS.find((d) => d.key === 'total-program-rotation')!
const tprOpen = rateCents(tpr, 'open')
const allAudience = newSponsorPackage('total-audience-plan')
const driveAll = newSponsorPackage('drive-all-the-time')
const plus = newSponsorPackage('drive-time-plan-plus')

export const GOALS: readonly Goal[] = [
  {
    key: 'community-supporter',
    name: 'Be known as a community supporter',
    title: 'Become the business listeners associate with public radio',
    lead: 'One short message at the same time every week becomes part of listeners’ routine. If you also back a nonprofit, say so on air with a Sharing Spirit message.',
    total: `${formatMoney(CARPOOL.oneYearCents)} a year`,
    span: 'The Carpool Plan for 52 weeks, about $4 a day. The other lines are optional.',
    mix: [
      { channel: 'On air', what: 'The Carpool Plan', detail: `A ${CARPOOL.words}-word message airs each week on the day and time you choose, sharing the break with one other business.`, price: `${formatMoney(CARPOOL.oneYearCents)} a year` },
      { channel: 'On air, optional', what: 'The Sharing Spirit', detail: 'Name your business, the nonprofit you support and what it does, in one message.', price: 'At the rate card price' },
      { channel: 'Digital, optional', what: 'A sponsor message on wuwf.org', detail: 'Add a month online whenever you want more visibility.', price: `${formatMoney(WEBSITE_MONTH_CENTS)} a month` },
    ],
  },
  {
    key: 'new-to-wuwf',
    name: 'I’m new to WUWF',
    title: 'Start in the news hours, at 25% off',
    lead: `First-time sponsors pay ${formatMoney(NEW_SPONSOR_DRIVE_CENTS)} for drive-time credits that normally cost ${formatMoney(DRIVE_TIME_OPEN_CENTS)}, in the morning and afternoon NPR news hours.`,
    total: packagePrice(driveAll),
    span: `${driveAll.name}: 52 drive-time credits, a ${formatMoney(driveAll.valueCents)} value. You save ${formatMoney(savings(driveAll))}.`,
    mix: [
      { channel: 'On air', what: '52 drive-time credits', detail: 'Credits air 6–9 a.m. or 3–7 p.m.', price: `${packagePrice(driveAll)} (a ${formatMoney(driveAll.valueCents)} value)` },
      { channel: 'Or', what: plus.name, detail: '26 drive-time credits and 26 Total Program Rotation credits.', price: `${formatMoney(plus.priceCents)} (a ${formatMoney(plus.valueCents)} value)` },
      { channel: 'Billing', what: 'Invoiced monthly, if you prefer', detail: 'Spread the cost across the contract period.', price: '' },
    ],
  },
  {
    key: 'start-small',
    name: 'Start small',
    title: 'Get on the air for $500',
    lead: '26 credits spread across the broadcast day, on the days you choose. It’s our most affordable on-air package for first-time sponsors.',
    total: packagePrice(allAudience),
    span: `26 credits for about ${formatMoney(Math.round(allAudience.priceCents / 26 / 100) * 100)} each, a ${formatMoney(allAudience.valueCents)} value.`,
    mix: [
      { channel: 'On air', what: allAudience.name, detail: '26 credits that air between 6 a.m. and 7 p.m., Monday through Sunday. You choose the days.', price: `${packagePrice(allAudience)} (a ${formatMoney(allAudience.valueCents)} value)` },
      { channel: 'Digital, optional', what: 'A sponsor message on wuwf.org', detail: 'Add it alongside your credits.', price: `${formatMoney(WEBSITE_MONTH_CENTS)} a month` },
      { channel: 'Billing', what: 'Invoiced monthly, if you prefer', detail: 'Spread the cost across the contract period.', price: '' },
    ],
  },
  {
    key: 'promote-an-event',
    name: 'Promote my event',
    title: 'Fill the room',
    lead: 'Build awareness in the weeks before your date with credits across the whole broadcast day, plus a month online in the app, on the website and in the e-newsletter.',
    total: formatMoney(26 * tprOpen + DIGITAL_PACKAGE_CENTS),
    span: 'Four weeks: 26 Total Program Rotation credits at the open rate, plus the digital package.',
    mix: [
      { channel: 'On air', what: '26 Total Program Rotation credits', detail: 'Your message rotates through the day and evening programming.', price: `${formatMoney(26 * tprOpen)} (${formatMoney(tprOpen)} each, open rate)` },
      { channel: 'Digital package', what: 'One month online', detail: 'A single banner in the app, a display ad on wuwf.org and a message in one issue of the e-newsletter.', price: `${formatMoney(DIGITAL_PACKAGE_CENTS)} (separately, ${formatMoney(DIGITAL_SEPARATE_CENTS)})` },
    ],
  },
  {
    key: 'reach-people-online',
    name: 'Reach people online',
    title: 'Meet people on their phones and in their inboxes',
    lead: 'A banner in the app, a display ad on the website and a message in the e-newsletter. Buy them together for less, or one at a time.',
    total: `${formatMoney(DIGITAL_PACKAGE_CENTS)} a month`,
    span: `All three together. Bought separately: ${formatMoney(DIGITAL_SEPARATE_CENTS)}.`,
    mix: [
      { channel: 'App', what: 'Single banner', detail: '640 × 100.', price: `${formatMoney(APP_BANNER_MONTH_CENTS)} a month` },
      { channel: 'Website', what: 'Display ad on wuwf.org', detail: 'Shown on the website and on mobile devices.', price: `${formatMoney(WEBSITE_MONTH_CENTS)} a month` },
      { channel: 'E-newsletter', what: 'A message in one issue', detail: 'Delivered to WUWF members.', price: `${formatMoney(NEWSLETTER_ISSUE_CENTS)} an issue` },
    ],
  },
  {
    key: 'nonprofit',
    name: 'I’m a nonprofit',
    title: 'Spread the word about your cause',
    lead: `Nonprofits take ${NONPROFIT_PERCENT}% off WUWF’s open rates through the Paid Public Announcement rate, so your message goes further.`,
    total: formatMoney(26 * percentOff(tprOpen, NONPROFIT_PERCENT)),
    span: `26 Total Program Rotation credits at ${formatMoney(percentOff(tprOpen, NONPROFIT_PERCENT))} each instead of ${formatMoney(tprOpen)}.`,
    mix: [
      { channel: 'On air', what: '26 Total Program Rotation credits', detail: 'Your message rotates through the day and evening programming.', price: `${formatMoney(26 * percentOff(tprOpen, NONPROFIT_PERCENT))} (${formatMoney(tprOpen)} less ${NONPROFIT_PERCENT}%)` },
      { channel: 'Digital, optional', what: 'Website, app or e-newsletter', detail: 'Ask corporate support whether the nonprofit rate applies to digital.', price: `From ${formatMoney(NEWSLETTER_ISSUE_CENTS)} an issue` },
    ],
  },
] as const

/**
 * The board's seventh goal, "Back something WUWF puts on", is not here: its lines are the events and programs corporate support
 * has open, which an editor changes in the admin (`globals/Sponsorship`). `eventsGoal` builds it from them.
 */
export type ProgramLine = { name: string; summary: string }

export function eventsGoal(programs: readonly ProgramLine[]): Goal | null {
  if (programs.length === 0) return null
  return {
    key: 'events-and-programs',
    name: 'Back something WUWF puts on',
    title: 'Join something people show up for',
    lead: 'Put your name on a live series or community program that people attend, join and talk about.',
    total: 'Priced on request',
    span: 'Partnership levels and terms are set for each event or program.',
    mix: programs.map((p) => ({ channel: 'Events and programs', what: p.name, detail: p.summary, price: 'Priced on request' })),
  }
}
