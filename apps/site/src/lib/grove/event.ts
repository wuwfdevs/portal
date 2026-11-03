// A Grove community-calendar page (`/event/EventPage.hbs`) to an event. Pure, like the other converters: no network, no
// database. The page's date text becomes a schedule where it matches a shape seen in the real data (`lib/events/grove-time`);
// anything it cannot read is kept as the original wording and flagged, never given a guessed date.
//
// What Grove shows people is kept: title, description, categories, picture, venue, presenting organization and its contact
// details, price, ticket link. What is only Grove's machinery (share buttons, scripts, site chrome, the empty artist block) is
// not. The person who submitted an event is not on the page, so there is nothing of theirs to carry.

import { isEmail, webAddress } from '../events/submission'
import { parseGroveTime, submittedOn } from '../events/grove-time'
import type { StoredSchedule } from '../events/stored'
import { scheduleToStored } from '../events/stored'
import { Ctx, absoluteUrl, plainText } from './context'
import { arr, obj, str, template } from './enhancements'
import { htmlToNodes } from './html'
import * as lex from './lexical'
import type { AssetRef, AssetToken, LexicalState, StoryReport } from './types'

const EVENT = '/event/EventPage.hbs'

const STATES: Record<string, string> = Object.fromEntries(
  Object.entries({
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  }).map(([code, name]) => [name.toLowerCase(), code]),
)

export interface ConvertedEvent {
  legacy: { groveId: string; legacyPath: string; needsAttention: boolean; notes: string | null }
  /** The exact Grove address, e.g. `/community-calendar/event/<slug>-19-09-2024-12-35-06`. */
  path: string
  title: string
  teaser: string | null
  description: LexicalState | null
  categories: { groveId: string; title: string }[]
  schedule: StoredSchedule
  venue: { name: string | null; street: string | null; city: string | null; state: string | null; zip: string | null; website: string | null }
  organization: { name: string | null; email: string | null; phone: string | null; website: string | null }
  price: string | null
  free: boolean
  ticketUrl: string | null
  image: AssetToken | null
  assets: AssetRef[]
}

export type ConvertEventResult =
  | { status: 'converted'; event: ConvertedEvent; report: StoryReport }
  | { status: 'skipped'; reason: 'not-an-event'; report: StoryReport }

const text = (v: unknown): string | null => plainText(str(v)).text || null

export function convertEventPage(raw: unknown): ConvertEventResult {
  const j = obj(raw)
  const groveId = str(j?.contentId) ?? ''
  let path = ''
  try {
    path = new URL(str(j?.canonicalLink) ?? '').pathname.replace(/\/$/, '')
  } catch {
    /* reported below */
  }
  if (!j || template(j) !== EVENT) {
    const ctx = new Ctx(groveId || 'none')
    ctx.note('page.not-an-event', template(j) || 'no template')
    return { status: 'skipped', reason: 'not-an-event', report: ctx.report(path, groveId) }
  }

  const ctx = new Ctx(groveId || path)
  if (!groveId) ctx.fail('event.no-content-id')
  if (!/^\/community-calendar\/event\/[^/]+$/.test(path)) ctx.fail('event.no-address', path || 'no canonical address')
  const title = text(j.eventName) ?? text(j.title)?.replace(/\s*\|\s*WUWF\s*$/i, '') ?? ''
  if (!title) ctx.fail('event.no-title')

  // When.
  const when = parseGroveTime(j.time, { submitted: submittedOn(path), recurring: j.recurring === true })
  for (const n of when.notes) (when.understood ? ctx.note : ctx.preserve).call(ctx, when.understood ? 'event.date' : 'event.date-not-read', n)
  const schedule: StoredSchedule = { ...scheduleToStored(when.schedule), displayText: when.displayText || null, startEstimated: when.startEstimated }

  // What it is.
  const items = arr(j.eventDescription).flatMap((block) => arr(obj(block)?.items)).filter((x): x is string => typeof x === 'string' && x.trim() !== '')
  const nodes = items.flatMap((html) => htmlToNodes(html, ctx))
  // An event's description is plain rich text: the editor behind it takes no blocks and would drop one without a word, so a block here is an exception.
  for (const p of lex.lexicalProblems(lex.root(nodes), [])) ctx.fail('output.invalid', p)
  const firstParagraph = items[0] ? plainText(items[0].split(/<\/p>/i)[0]).text : ''
  const teaser = firstParagraph ? (firstParagraph.length > 280 ? `${firstParagraph.slice(0, 279).replace(/\s+\S*$/, '')}…` : firstParagraph) : null
  if (!nodes.length) ctx.note('event.no-description')

  const categories = arr(j.categories).flatMap((c) => {
    const o = obj(c)
    const name = text(o?.body)
    const id = str(o?.contentId)
    return name && id ? [{ groveId: id, title: name }] : []
  })
  if (!categories.length) ctx.note('event.no-category')

  // Where.
  const v = obj(arr(j.venueInformation)[0])
  const venueName = text(v?.name) ?? text(j.venueName)
  if (!venueName) ctx.note('event.no-venue')
  const rawState = text(v?.state)
  const state = rawState ? (/^[A-Za-z]{2}$/.test(rawState) ? rawState.toUpperCase() : (STATES[rawState.toLowerCase()] ?? rawState)) : null
  if (rawState && state === rawState && !/^[A-Z]{2}$/.test(rawState)) ctx.note('event.state-not-recognised', rawState)
  const link = (label: string, value: unknown): string | null => {
    const s = text(value)
    if (!s) return null
    const url = webAddress(s)
    if (!url) ctx.preserve('event.link-dropped', `${label}: ${s.slice(0, 80)}`)
    return url
  }
  const org = obj(arr(j.presentingOrganization)[0])
  const orgEmail = text(org?.email)
  if (orgEmail && !isEmail(orgEmail)) ctx.preserve('event.email-dropped', orgEmail)

  // Money and tickets.
  const price = text(j.price)
  const free = price !== null && /^free\.?$/i.test(price)

  // Picture.
  const img = obj(arr(j.eventImage)[0])
  const src = absoluteUrl(str(obj(img?.image)?.src))
  const image = src ? ctx.asset({ kind: 'image', sourceUrl: src, ...(text(img?.alt) ? { alt: text(img!.alt)! } : {}) }) : null
  if (!image && arr(j.eventImage).length > 0) ctx.preserve('event.image-not-mapped')

  const notes = ctx.entries.filter((e) => e.level !== 'noted' || e.code.startsWith('event.date')).map((e) => `${e.code}${e.detail ? `: ${e.detail}` : ''}`)
  const event: ConvertedEvent = {
    legacy: { groveId, legacyPath: path, needsAttention: ctx.entries.some((e) => e.level === 'preserved' || e.level === 'exception'), notes: notes.length ? notes.join('\n') : null },
    path,
    title,
    teaser,
    description: nodes.length ? lex.root(nodes) : null,
    categories,
    schedule,
    venue: { name: venueName, street: text(v?.streetAddress), city: text(v?.city), state, zip: text(v?.zip), website: link('venue website', v?.website) },
    organization: { name: text(org?.name), email: orgEmail && isEmail(orgEmail) ? orgEmail : null, phone: text(org?.phone), website: link('organization website', org?.website) },
    price: free ? null : price,
    free,
    ticketUrl: link('ticket link', j.ticketingWebsite),
    image,
    assets: [...ctx.assets.values()],
  }
  return { status: 'converted', event, report: ctx.report(path, groveId) }
}
