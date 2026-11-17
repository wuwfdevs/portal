import { describe, expect, it } from 'vitest'

import type { Sponsorship } from '@/payload-types'

import { fill, listOf, paragraphs, phoneHref, shown, toStats } from './content'
import { goalList } from './goals'
import { chosenInterests, inquiryEmail, validateInquiry } from './inquiry'
import { formatMoney, percentOff } from './money'
import { sponsorNavItems } from './nav'
import { packageViews, perMonth } from './packages'
import { SPONSOR_PATHS } from './paths'
import { openPrograms, summaryOf } from './programs'
import { commitmentNeverCostsMore, estimateSchedule, rateCard } from './rates'
import { SPONSORSHIP_STARTER as STARTER } from './starter'

const starter = STARTER as unknown as Sponsorship
const card = rateCard(starter.onAir?.rates)
const row = (label: string) => card.rows.find((r) => r.label === label)!

describe('money', () => {
  it('prints whole dollars without cents and anything else with two places', () => {
    expect(formatMoney(214500)).toBe('$2,145')
    expect(formatMoney(4125)).toBe('$41.25')
    expect(formatMoney(156650)).toBe('$1,566.50')
  })
  it('takes a percentage off to the nearest cent', () => {
    expect(percentOff(78000, 5)).toBe(74100)
    expect(percentOff(3000, 20)).toBe(2400)
  })
})

describe('content helpers', () => {
  it('treats an unset switch as on, and only an explicit false as off', () => {
    expect(shown({ show: true })).toBe(true)
    expect(shown({})).toBe(true)
    expect(shown({ show: false })).toBe(false)
    expect(shown(undefined)).toBe(false)
  })
  it('splits paragraphs at blank lines, fills tokens and builds tel links', () => {
    expect(paragraphs('One.\n\n  \nTwo.\nStill two.')).toEqual(['One.', 'Two.\nStill two.'])
    expect(fill('Talk to us about {name}', { name: 'RadioLive' })).toBe('Talk to us about RadioLive')
    expect(fill('Keep {unknown}', {})).toBe('Keep {unknown}')
    expect(phoneHref('850 473-7453')).toBe('tel:+18504737453')
    expect(phoneHref('call us')).toBeNull()
    expect(listOf(['A', 'B', 'C'])).toBe('A, B and C')
  })
  it('drops a figure that has no number or no words', () => {
    expect(toStats([{ value: '5%', text: 'x' }, { value: '', text: 'y' }, { value: '9', text: ' ' }])).toEqual([{ value: '5%', text: 'x' }])
  })
})

describe('the starting content (the reviewed boards, in the admin)', () => {
  it('prints no bracketed review note anywhere', () => {
    expect(JSON.stringify(STARTER)).not.toMatch(/\[[A-Z][^\]]*(confirm|Confirm|Rate)[^\]]*\]/)
  })
  it('has a rate card whose price never rises with a longer commitment', () => {
    expect(card.rows).toHaveLength(7)
    for (const r of card.rows) expect(commitmentNeverCostsMore(r.cents)).toBe(true)
    expect(commitmentNeverCostsMore([5000, 5500])).toBe(false)
  })
  it('estimates the board’s own example: a year of Total Program Rotation, 26 credits', () => {
    const e = estimateSchedule(card, { row: row('Total Program Rotation').key, term: '1y', credits: 26 })
    expect(e).toMatchObject({ total: '$598', detail: '26 credits at $23 each', prepaid: 'Prepaid: $568.10 (5% additional discount).' })
    expect(e?.nonprofit).toBe('The nonprofit rate (20% off) applies to open rates.')
  })
  it('gives the nonprofit price only on open rates, and refuses what it does not sell', () => {
    const key = row('Total Program Rotation').key
    expect(estimateSchedule(card, { row: key, term: 'open', credits: 26 })?.nonprofit).toBe('Nonprofit rate: $624 (20% off open rates).')
    expect(estimateSchedule(card, { row: 'nope', term: 'open', credits: 13 })).toBeNull()
    expect(estimateSchedule(card, { row: key, term: 'open', credits: 7 })).toBeNull()
  })

  const packages = packageViews(starter.onAir?.packages)
  const open = starter.onAir!.packages!.openDriveRate!
  const discounted = starter.onAir!.packages!.newDriveRate!
  it('prints the savings the board prints', () => {
    expect(packages.map((p) => p.valueLine)).toEqual([
      'A $2,860 value. You save $715.',
      'A $2,210 value. You save $643.50.',
      'A $1,950 value. You save $487.50.',
      'A $780 value. You save $280.',
    ])
  })
  it('prices a new sponsor’s drive-time credit at 25% off the open rate, and the first package adds up from it', () => {
    expect(discounted).toBe(percentOff(open * 100, 25) / 100)
    expect(packages[0]!.priceCents).toBe(52 * discounted * 100)
    expect(starter.onAir!.packages!.items![0]!.value).toBe(52 * open)
  })
  it('keeps Package 2’s Total Program Rotation credits at $19 (the board’s open question against $30 open)', () => {
    const tpr = (packages[1]!.priceCents - 26 * discounted * 100) / 26
    expect(tpr).toBe(1900)
  })
  it('splits the Carpool Plan by the month as the board does', () => {
    expect(perMonth(715, 6)).toBe('$119.17')
    expect(perMonth(1430, 12)).toBe('$119.17')
  })

  const goals = goalList(starter.hub?.goals, [{ name: 'RadioLive', summary: 'Monthly live music.' }])
  it('has the six board goals plus one built from the open programs, each with lines', () => {
    expect(goals).toHaveLength(7)
    for (const g of goals) expect(g.mix.length).toBeGreaterThanOrEqual(2 - (g.key === 'events-and-programs' ? 1 : 0))
    expect(goals.at(-1)).toMatchObject({ name: 'Back something WUWF puts on', total: 'Priced on request' })
  })
  it('leaves the events goal out when no program is open', () => {
    expect(goalList(starter.hub?.goals, [])).toHaveLength(6)
  })
  it('quotes goal totals that match the packages and rates', () => {
    const byName = Object.fromEntries(goals.map((g) => [g.name, g]))
    expect(byName['I’m new to WUWF']!.total).toBe(packages[0]!.price)
    expect(byName['Start small']!.total).toBe(packages[3]!.price)
    expect(byName['Promote my event']!.total).toBe('$1,180')
    expect(byName['I’m a nonprofit']!.total).toBe('$624')
  })
  it('has a three-card "where you can appear" strip and seven sector views', () => {
    expect(starter.hub?.places?.items).toHaveLength(3)
    expect(starter.audience?.sectors?.items).toHaveLength(7)
  })
})

describe('events and programs (board 19)', () => {
  const raw = [
    { id: 'a', name: ' RadioLive ', kind: 'live-series', description: 'Live music. Every month.', status: 'open', levels: [{ name: 'Presenting partner', description: 'The series.', price: '' }, { name: '', price: '$1' }] },
    { id: 'b', name: 'Held thing', status: 'held', levels: [{ name: 'Gold', price: '$5,000' }] },
    { id: 'c', name: '', status: 'open' },
  ]
  it('shows only open, named programs, with unpriced levels as "Priced on request"', () => {
    const p = openPrograms(raw)
    expect(p.map((x) => x.name)).toEqual(['RadioLive'])
    expect(p[0]!.levels).toEqual([{ key: expect.any(String), name: 'Presenting partner', description: 'The series.', price: 'Priced on request' }])
  })
  it('keeps a stated price as written and gives a one-sentence summary', () => {
    expect(openPrograms([{ name: 'X', levels: [{ name: 'Gold', price: '$5,000 a season' }] }])[0]!.levels[0]!.price).toBe('$5,000 a season')
    expect(summaryOf('Live music. Every month.')).toBe('Live music.')
  })
})

describe('the inquiry (board 16)', () => {
  const choices = { interests: ['The Carpool Plan', 'Not sure yet'], budgets: ['Not sure yet', 'Under $1,000'] }
  const good = { name: 'Pat', organization: 'Example Co', email: 'pat@example.com', phone: '', interests: ['The Carpool Plan'], budget: 'Under $1,000', message: 'Hello' }
  it('accepts a complete inquiry and checks choices against what the admin offers', () => {
    expect(validateInquiry(good, choices).ok).toBe(true)
    expect(validateInquiry({ ...good, interests: ['Free cruise'] }, choices).ok).toBe(false)
    expect(validateInquiry({ ...good, budget: '$1 billion' }, choices).ok).toBe(false)
    expect(validateInquiry({ ...good, budget: '' }, choices).ok).toBe(true)
  })
  it('asks for a name, a business and a working email, and says what is wrong with each', () => {
    const r = validateInquiry({ ...good, name: ' ', organization: '', email: 'not an email' }, choices)
    expect(r).toMatchObject({ ok: false, errors: { name: expect.any(String), organization: expect.any(String), email: expect.stringContaining('doesn’t look right') } })
    expect(validateInquiry({ ...good, phone: 'call me' }, choices).ok).toBe(false)
  })
  it('keeps one copy of an interest chosen twice and cuts an over-long message', () => {
    const r = validateInquiry({ ...good, interests: ['The Carpool Plan', 'The Carpool Plan'], message: 'x'.repeat(5000) }, choices)
    expect(r.ok && r.value.interests).toEqual(['The Carpool Plan'])
    expect(r.ok && r.value.message.length).toBe(2000)
  })
  it('puts no line break in the email subject, replies to the sender and says what they chose', () => {
    const r = validateInquiry({ ...good, organization: 'Example\r\nBcc: x@evil.test' }, choices)
    const mail = r.ok ? inquiryEmail(r.value) : null
    expect(mail?.subject).not.toMatch(/[\r\n]/)
    expect(mail?.replyTo).toBe('pat@example.com')
    expect(chosenInterests([])).toBe('nothing in particular yet')
  })
})

describe('navigation', () => {
  it('lists all six pages under the admin’s names, marks the current one, and falls back to plain names', () => {
    const items = sponsorNavItems('digital', { digital: 'Online' })
    expect(items.map((i) => i.href)).toEqual(Object.values(SPONSOR_PATHS))
    expect(items.find((i) => i.current)?.label).toBe('Online')
    expect(items[0]!.label).toBe('Sponsor WUWF')
  })
})
