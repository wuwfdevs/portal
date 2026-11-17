import { describe, expect, it } from 'vitest'

import { SECTORS, sector } from './audience'
import { BUDGETS, FAQ, INTERESTS, SPONSOR_PATHS } from './content'
import { APP_PLACEMENTS, DIGITAL_PACKAGE_CENTS, DIGITAL_SEPARATE_CENTS, NEWSLETTER_AND_AUDIO_PLACEMENTS, WEBSITE_PLACEMENTS } from './digital'
import { GOALS, eventsGoal } from './goals'
import { chosenInterests, inquiryEmail, validateInquiry } from './inquiry'
import { formatMoney, percentOff } from './money'
import { sponsorNavItems } from './nav'
import { CARPOOL, NEW_SPONSOR_DRIVE_CENTS, NEW_SPONSOR_PACKAGES, carpoolPerMonth, packageValueLine, savings } from './packages'
import { openPrograms, summaryOf } from './programs'
import { CREDIT_COUNTS, DAYPARTS, estimateSchedule, rateCents } from './rates'

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

describe('the rate card (board 17)', () => {
  it('gets cheaper the longer the commitment, in every daypart', () => {
    for (const d of DAYPARTS) expect([...d.cents].sort((a, b) => b - a)).toEqual([...d.cents])
  })
  it('estimates the board’s own example: a year of Total Program Rotation, 26 credits', () => {
    const e = estimateSchedule({ daypart: 'total-program-rotation', term: '1y', credits: 26 })
    expect(e).toMatchObject({ total: '$598', detail: '26 credits at $23 each', prepaid: 'Prepaid: $568.10 (5% additional discount).' })
    expect(e?.nonprofit).toBe('The nonprofit rate (20% off) applies to open rates.')
  })
  it('gives the nonprofit price only on open rates', () => {
    expect(estimateSchedule({ daypart: 'total-program-rotation', term: 'open', credits: 26 })?.nonprofit).toBe('Nonprofit rate: $624 (20% off open rates).')
  })
  it('refuses a daypart, term or count it does not sell', () => {
    expect(estimateSchedule({ daypart: 'nope', term: 'open', credits: 13 })).toBeNull()
    expect(estimateSchedule({ daypart: 'midday', term: '2y' as never, credits: 13 })).toBeNull()
    expect(estimateSchedule({ daypart: 'midday', term: 'open', credits: 7 })).toBeNull()
    expect(CREDIT_COUNTS).toEqual([13, 26, 52, 104])
  })
})

describe('the new-sponsor packages and the Carpool Plan', () => {
  const rate = (key: string, term: Parameters<typeof rateCents>[1]) => rateCents(DAYPARTS.find((d) => d.key === key)!, term)

  it('prints the savings the board prints', () => {
    expect(NEW_SPONSOR_PACKAGES.map(packageValueLine)).toEqual([
      'A $2,860 value. You save $715.',
      'A $2,210 value. You save $643.50.',
      'A $1,950 value. You save $487.50.',
      'A $780 value. You save $280.',
    ])
  })
  it('prices drive-time credits at 25% off the $55 open rate', () => {
    expect(percentOff(rate('morning-drive', 'open'), 25)).toBe(NEW_SPONSOR_DRIVE_CENTS)
  })
  it('adds up: Drive All the Time is 52 discounted drive-time credits; its value is 52 at the open rate', () => {
    const p = NEW_SPONSOR_PACKAGES[0]!
    expect(p.priceCents).toBe(52 * NEW_SPONSOR_DRIVE_CENTS)
    expect(p.valueCents).toBe(52 * rate('morning-drive', 'open'))
  })
  it('adds up: Drive Time Plan Plus leaves $19 a Total Program Rotation credit (the open question on the board: $30 open)', () => {
    const p = NEW_SPONSOR_PACKAGES[1]!
    const tprCents = (p.priceCents - 26 * NEW_SPONSOR_DRIVE_CENTS) / 26
    expect(tprCents).toBe(1900)
    expect(p.valueCents).toBe(26 * rate('morning-drive', 'open') + 26 * rate('total-program-rotation', 'open'))
  })
  it('adds up: the Total Audience Plan’s value is 26 credits at the Total Program Rotation open rate', () => {
    expect(NEW_SPONSOR_PACKAGES[3]!.valueCents).toBe(26 * rate('total-program-rotation', 'open'))
  })
  it('never shows a package that costs more than it is worth', () => {
    for (const p of NEW_SPONSOR_PACKAGES) expect(savings(p)).toBeGreaterThan(0)
  })
  it('splits the Carpool Plan by the month as the board does', () => {
    expect(carpoolPerMonth(CARPOOL.sixMonthsCents, 6)).toBe('$119.17')
    expect(carpoolPerMonth(CARPOOL.oneYearCents, 12)).toBe('$119.17')
  })
})

describe('digital (board 18)', () => {
  it('prices the digital package below the three bought separately: $400 against $450', () => {
    expect(DIGITAL_PACKAGE_CENTS).toBe(40000)
    expect(DIGITAL_SEPARATE_CENTS).toBe(45000)
  })
  it('leaves out any placement whose size or rate is still to be confirmed', () => {
    for (const p of [...WEBSITE_PLACEMENTS, ...APP_PLACEMENTS, ...NEWSLETTER_AND_AUDIO_PLACEMENTS]) {
      expect(`${p.name}${p.detail}${p.size}${p.price}`).not.toMatch(/\[|to confirm/i)
    }
    expect(WEBSITE_PLACEMENTS.map((p) => p.name)).toEqual(['Display ad'])
  })
})

describe('the goals (board 16)', () => {
  it('has six fixed goals, each with a headline and at least two lines', () => {
    expect(GOALS).toHaveLength(6)
    for (const g of GOALS) {
      expect(g.title && g.lead && g.total && g.span).toBeTruthy()
      expect(g.mix.length).toBeGreaterThanOrEqual(2)
    }
  })
  it('restates the packages and rates it quotes, in the board’s words', () => {
    const byKey = Object.fromEntries(GOALS.map((g) => [g.key, g]))
    expect(byKey['community-supporter']!.total).toBe('$1,430 a year')
    expect(byKey['new-to-wuwf']!.total).toBe('$2,145')
    expect(byKey['new-to-wuwf']!.lead).toContain('$41.25')
    expect(byKey['start-small']!.span).toBe('26 credits for about $19 each, a $780 value.')
    expect(byKey['promote-an-event']!.total).toBe('$1,180')
    expect(byKey['reach-people-online']!.span).toBe('All three together. Bought separately: $450.')
    expect(byKey['nonprofit']!.total).toBe('$624')
  })
  it('builds the seventh goal from the open programs, and leaves it out when none is open', () => {
    expect(eventsGoal([])).toBeNull()
    expect(eventsGoal([{ name: 'RadioLive', summary: 'Monthly live music.' }])?.mix[0]).toMatchObject({ what: 'RadioLive', price: 'Priced on request' })
  })
})

describe('events and programs (board 19)', () => {
  const raw = [
    { id: 'a', name: ' RadioLive ', kind: 'live-series', description: 'Live music. Every month.', status: 'open', levels: [{ name: 'Presenting partner', description: 'The series.', price: '' }, { name: '', price: '$1' }] },
    { id: 'b', name: 'Held thing', status: 'held', levels: [{ name: 'Gold', price: '$5,000' }] },
    { id: 'c', name: '', status: 'open' },
  ]
  it('shows only open, named programs', () => {
    expect(openPrograms(raw).map((p) => p.name)).toEqual(['RadioLive'])
  })
  it('shows "Priced on request" for a level with no confirmed price, and skips an unnamed level', () => {
    expect(openPrograms(raw)[0]!.levels).toEqual([{ key: expect.any(String), name: 'Presenting partner', description: 'The series.', price: 'Priced on request' }])
  })
  it('keeps a stated price as written', () => {
    expect(openPrograms([{ name: 'X', levels: [{ name: 'Gold', price: '$5,000 a season' }] }])[0]!.levels[0]!.price).toBe('$5,000 a season')
  })
  it('gives a one-sentence summary', () => {
    expect(summaryOf('Live music. Every month.')).toBe('Live music.')
    expect(summaryOf('No full stop')).toBe('No full stop')
  })
})

describe('the inquiry (board 16)', () => {
  const good = { name: 'Pat', organization: 'Example Co', email: 'pat@example.com', phone: '', interests: ['The Carpool Plan'], budget: 'Under $1,000', message: 'Hello' }
  it('accepts a complete inquiry', () => {
    const r = validateInquiry(good)
    expect(r.ok).toBe(true)
  })
  it('asks for a name, a business and a working email, and says what is wrong with each', () => {
    const r = validateInquiry({ ...good, name: ' ', organization: '', email: 'not an email' })
    expect(r).toMatchObject({ ok: false, errors: { name: expect.any(String), organization: expect.any(String), email: expect.stringContaining('doesn’t look right') } })
  })
  it('treats phone and budget as optional, and refuses an interest or budget the form does not offer', () => {
    expect(validateInquiry({ ...good, phone: '', budget: '' }).ok).toBe(true)
    expect(validateInquiry({ ...good, interests: ['Free cruise'] }).ok).toBe(false)
    expect(validateInquiry({ ...good, budget: '$1 billion' }).ok).toBe(false)
    expect(validateInquiry({ ...good, phone: 'call me' }).ok).toBe(false)
  })
  it('keeps one copy of an interest chosen twice and cuts an over-long message', () => {
    const r = validateInquiry({ ...good, interests: ['The Carpool Plan', 'The Carpool Plan'], message: 'x'.repeat(5000) })
    expect(r.ok && r.value.interests).toEqual(['The Carpool Plan'])
    expect(r.ok && r.value.message.length).toBe(2000)
  })
  it('puts no line break in the email subject, whatever the organization field held', () => {
    const r = validateInquiry({ ...good, organization: 'Example\r\nBcc: x@evil.test' })
    expect(r.ok && inquiryEmail(r.value).subject).not.toMatch(/[\r\n]/)
  })
  it('replies to the sender and says what they chose', () => {
    const r = validateInquiry(good)
    const mail = r.ok ? inquiryEmail(r.value) : null
    expect(mail?.replyTo).toBe('pat@example.com')
    expect(mail?.text).toContain('Interested in: The Carpool Plan')
    expect(chosenInterests([])).toBe('nothing in particular yet')
  })
  it('offers the budget ranges the board lists, with "Not sure yet" first', () => {
    expect(BUDGETS[0]).toBe('Not sure yet')
    expect(INTERESTS).toContain('Not sure yet')
  })
})

describe('the rest of the sponsorship section', () => {
  it('lists all six pages in the strip and marks the current one', () => {
    const items = sponsorNavItems('digital')
    expect(items.map((i) => i.href)).toEqual(Object.values(SPONSOR_PATHS))
    expect(items.filter((i) => i.current).map((i) => i.label)).toEqual(['Digital'])
  })
  it('has seven sector views, and falls back to the first for an unknown one', () => {
    expect(SECTORS).toHaveLength(7)
    expect(sector('travel').name).toBe('Travel')
    expect(sector('nope').key).toBe(SECTORS[0]!.key)
  })
  it('keeps the "no prices, no claims" restraint in the FAQ’s own words', () => {
    expect(FAQ.find((f) => f.question.includes('sale'))?.answer).toMatch(/^No\./)
  })
  it('prints no bracketed placeholder anywhere in the fixed copy', async () => {
    const all = JSON.stringify(await Promise.all([import('./content'), import('./audience'), import('./digital')]))
    expect(all).not.toMatch(/\[[A-Z][^\]]*(confirm|Confirm|Rate)[^\]]*\]/)
  })
})
