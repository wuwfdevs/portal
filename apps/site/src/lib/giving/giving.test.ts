import { describe, expect, it } from 'vitest'

import { donateConfigOf, levelViews } from './content'
import { buildDonateModel, donationHref, type DonateConfig } from './donate'
import { benefitLines, levelFor, messagePhrase, messagesFor, yearlyTotal, type GivingLevel, type MessageTier } from './levels'
import { formatMoney } from './money'
import { givingNavItems, givingNavTitle } from './nav'
import { GIVING_NAV_PAGES } from './paths'
import { readThanks, thanksText } from './thanks'
import { detailsText, groupTarget, selectWay, type WayGroup, type WayPanel } from './ways'

// The levels and message tiers of the reviewed boards (14 and 14a), as an editor would hold them.
const WORDS = { one: 'A short personal message', many: '{count} short personal messages' }
const LEVELS: GivingLevel[] = [
  { name: 'Member', minimumMonthly: 5, giftBenefits: ['A thank-you and a tax receipt', 'Supports the newsroom, the stations and the shows'] },
  { name: 'Sustaining Member', minimumMonthly: 10, giftBenefits: ['A thank-you and a tax receipt', 'NPR+ Podcast Bundle: sponsor-free listening'] },
  { name: 'Day Sponsor', minimumMonthly: 15, giftBenefits: ['A thank-you and a tax receipt', 'NPR+ Podcast Bundle: sponsor-free listening', '{messages} on 88.1, on days you choose'] },
  { name: 'Crystal Circle', minimumMonthly: 100, giftBenefits: ['A thank-you and a tax receipt', '{messages} on 88.1, on days you choose', 'Recognition for leadership giving'] },
]
const TIERS: MessageTier[] = [
  { yearly: 180, count: 1 },
  { yearly: 360, count: 2 },
  { yearly: 600, count: 3 },
  { yearly: 1200, count: 4 },
]

describe('levels', () => {
  it('counts a monthly gift for twelve months and a one-time gift once', () => {
    expect(yearlyTotal(10, 'monthly')).toBe(120)
    expect(yearlyTotal(120, 'once')).toBe(120)
  })

  it.each([
    [60, 'Member'],
    [119, 'Member'],
    [120, 'Sustaining Member'],
    [179, 'Sustaining Member'],
    [180, 'Day Sponsor'],
    [1199, 'Day Sponsor'],
    [1200, 'Crystal Circle'],
    [25, 'Member'], // below the lowest level: still the lowest, never "no level"
  ])('a gift of %i a year lands in %s', (yearly, name) => {
    expect(levelFor(LEVELS, yearly)?.name).toBe(name)
  })

  it('finds the level whatever order the admin lists them in, and has none when there are no levels', () => {
    expect(levelFor([...LEVELS].reverse(), 240)?.name).toBe('Day Sponsor')
    expect(levelFor([], 500)).toBeNull()
  })

  // The board's own examples: one message at $15 or $20 a month, two at $30, three at $50, four at $100.
  it.each([
    [10 * 12, 0],
    [15 * 12, 1],
    [20 * 12, 1],
    [30 * 12, 2],
    [50 * 12, 3],
    [100 * 12, 4],
    [360, 2], // given once
  ])('a year of %i earns %i Day Sponsor messages', (yearly, count) => {
    expect(messagesFor(TIERS, yearly)).toBe(count)
  })

  it('earns no messages without tiers, and does not depend on the order of the tiers', () => {
    expect(messagesFor([], 5000)).toBe(0)
    expect(messagesFor([...TIERS].reverse(), 600)).toBe(3)
  })

  it('words the message line for one and for several', () => {
    expect(messagePhrase(1, WORDS)).toBe('A short personal message')
    expect(messagePhrase(3, WORDS)).toBe('3 short personal messages')
  })

  it('lists a level\'s lines, filling the message line only when the gift earns messages', () => {
    const daySponsor = LEVELS[2]!
    expect(benefitLines(daySponsor, 2, WORDS)).toEqual(['A thank-you and a tax receipt', 'NPR+ Podcast Bundle: sponsor-free listening', '2 short personal messages on 88.1, on days you choose'])
    expect(benefitLines(daySponsor, 0, WORDS)).toEqual(['A thank-you and a tax receipt', 'NPR+ Podcast Bundle: sponsor-free listening'])
    expect(benefitLines(null, 1, WORDS)).toEqual([])
  })

  it('formats whole dollars', () => {
    expect(formatMoney(1200)).toBe('$1,200')
    expect(formatMoney(10)).toBe('$10')
  })
})

describe('what the admin holds', () => {
  it('leaves a level out until it has a name and a monthly minimum, and orders the rest by the minimum', () => {
    const views = levelViews([
      { name: 'Crystal Circle', minimumMonthly: 100 },
      { name: 'Unfinished' },
      { name: '  ', minimumMonthly: 5 },
      { name: 'Free', minimumMonthly: 0 },
      { name: 'Member', minimumMonthly: 5, benefits: [{ text: ' A thank-you ' }, { text: '' }] },
    ] as never)
    expect(views.map((l) => l.name)).toEqual(['Member', 'Crystal Circle'])
    expect(views[0]!.benefits).toEqual(['A thank-you'])
  })

  it('offers each amount once, smallest first, and no frequency without amounts', () => {
    const cfg = donateConfigOf({ give: { card: { monthlyAmounts: [{ amount: 20 }, { amount: 5 }, { amount: 20 }, { amount: 0 }], onceAmounts: [] } } } as never)!
    expect(cfg.frequencies.map((f) => [f.key, f.amounts])).toEqual([['monthly', [5, 20]]])
    expect(cfg.frequencies[0]!.defaultAmount).toBe(5)
  })

  it('falls back to a plain template when an editor clears one that carries a placeholder', () => {
    const cfg = donateConfigOf({ give: { card: { monthlyAmounts: [{ amount: 10 }], titleMonthly: '', ctaMonthly: '  ' } } } as never)!
    expect(cfg.titleMonthly).toBe('At {amount} a month')
    expect(cfg.ctaMonthly).toBe('Give {amount} a month')
  })

  it('has no card at all when nothing is offered', () => {
    expect(donateConfigOf({} as never)).toBeNull()
  })
})

describe('donationHref', () => {
  const base = { address: 'https://give.example.org/form?fund=news&code=abc' }

  it('is null when there is nowhere to send a gift, or the address is not one we may link to', () => {
    expect(donationHref(null)).toBeNull()
    expect(donationHref({ address: '' })).toBeNull()
    expect(donationHref({ address: '   ' })).toBeNull()
    expect(donationHref({ address: 'javascript:alert(1)' })).toBeNull()
    expect(donationHref({ address: 'http://insecure.example.org' })).toBeNull()
    expect(donationHref({ address: 'mailto:give@example.org' })).toBeNull()
  })

  it('sends the plain address while pre-filling is unconfirmed, whatever the card chose', () => {
    expect(donationHref(base, { amount: 20, frequency: 'monthly' })).toBe(base.address)
    expect(donationHref({ ...base, prefill: false, amountParam: 'amount' }, { amount: 20, frequency: 'monthly' })).toBe(base.address)
  })

  it('adds the amount and frequency once pre-filling is on, keeping what the address already carries', () => {
    const form = { ...base, prefill: true, amountParam: 'amount', frequencyParam: 'freq', monthlyValue: 'M', onceValue: 'O' }
    const url = new URL(donationHref(form, { amount: 20, frequency: 'monthly' })!)
    expect(url.searchParams.get('fund')).toBe('news')
    expect(url.searchParams.get('code')).toBe('abc')
    expect(url.searchParams.get('amount')).toBe('20')
    expect(url.searchParams.get('freq')).toBe('M')
    expect(new URL(donationHref(form, { amount: 60, frequency: 'once' })!).searchParams.get('freq')).toBe('O')
  })

  it('falls back to the frequency word itself, and sends the frequency alone when no amount was chosen', () => {
    const form = { ...base, prefill: true, amountParam: 'amount', frequencyParam: 'freq' }
    const url = new URL(donationHref(form, { frequency: 'once' })!)
    expect(url.searchParams.get('freq')).toBe('once')
    expect(url.searchParams.has('amount')).toBe(false)
  })

  it('ignores a parameter name or value that could break out of the query', () => {
    const form = { ...base, prefill: true, amountParam: 'a&b=1', frequencyParam: 'freq', monthlyValue: 'x&y' }
    const url = new URL(donationHref(form, { amount: 5, frequency: 'monthly' })!)
    expect(url.searchParams.has('a&b=1')).toBe(false)
    expect(url.searchParams.has('b')).toBe(false)
    expect(url.searchParams.has('freq')).toBe(false)
  })

  it('handles a form on this site by path', () => {
    const form = { address: '/give/form', prefill: true, amountParam: 'amount' }
    expect(donationHref(form, { amount: 10, frequency: 'monthly' })).toBe('/give/form?amount=10')
  })
})

describe('buildDonateModel', () => {
  const config: DonateConfig = {
    frequencies: [
      { key: 'monthly', label: 'Monthly', sub: 'Most useful', amounts: [5, 10, 15, 20, 30, 50, 100], defaultAmount: 10 },
      { key: 'once', label: 'One time', sub: 'Give once', amounts: [60, 120, 180, 360, 600, 1200], defaultAmount: 120 },
    ],
    otherLabel: 'Other',
    titleMonthly: 'At {amount} a month',
    titleOnce: 'At {amount}',
    words: WORDS,
    anyTitle: 'Any amount helps',
    anyBenefits: ['Choose your own amount on the form.', 'A thank-you and a tax receipt.'],
    ctaMonthly: 'Give {amount} a month',
    ctaOnce: 'Give {amount}',
    ctaOther: 'Give another amount',
    levels: LEVELS,
    tiers: TIERS,
    form: { address: 'https://give.example.org/form', prefill: true, amountParam: 'amount', frequencyParam: 'freq' },
  }
  const model = buildDonateModel(config)
  const monthly = model[0]!
  const once = model[1]!
  const option = (f: typeof monthly, amount: number | null) => f.options.find((o) => o.amount === amount)!

  it('starts each frequency on its default amount', () => {
    expect(monthly.defaultKey).toBe('monthly-10')
    expect(once.defaultKey).toBe('once-120')
  })

  it('shows the board\'s monthly $10 card: Sustaining, the podcast bundle, no messages', () => {
    const o = option(monthly, 10)
    expect(o.title).toBe('At $10 a month')
    expect(o.benefits).toEqual(['A thank-you and a tax receipt', 'NPR+ Podcast Bundle: sponsor-free listening'])
    expect(o.cta).toBe('Give $10 a month')
    expect(new URL(o.href!).searchParams.get('amount')).toBe('10')
  })

  it('puts a one-time gift against the same levels by the year', () => {
    expect(option(once, 120).benefits).toContain('NPR+ Podcast Bundle: sponsor-free listening')
    expect(option(once, 360).benefits).toContain('2 short personal messages on 88.1, on days you choose')
    expect(option(once, 60).benefits).toContain('Supports the newsroom, the stations and the shows')
    expect(option(once, 60).cta).toBe('Give $60')
  })

  it('has an Other choice that sends no amount', () => {
    const other = option(monthly, null)
    expect(other).toMatchObject({ label: 'Other', title: 'Any amount helps', cta: 'Give another amount' })
    expect(new URL(other.href!).searchParams.has('amount')).toBe(false)
    expect(new URL(other.href!).searchParams.get('freq')).toBe('monthly')
  })

  it('has no links when there is no donation form, so no dead button is drawn', () => {
    const none = buildDonateModel({ ...config, form: { address: '' } })
    expect(none.flatMap((f) => f.options).every((o) => o.href === null)).toBe(true)
  })
})

describe('readThanks', () => {
  it('reads a first name, an amount and how often', () => {
    expect(readThanks({ name: 'Alex', amount: '10', frequency: 'monthly' })).toEqual({ name: 'Alex', amount: 10, frequency: 'monthly' })
    expect(readThanks({ name: "Mary-Anne O'Neil", amount: '120', frequency: 'ONCE' })).toEqual({ name: "Mary-Anne O'Neil", amount: 120, frequency: 'once' })
    expect(readThanks({ name: 'José', amount: '5' }).name).toBe('José')
  })

  it.each(['<script>alert(1)</script>', 'https://evil.example.org', 'Call 555-0100 now', 'a@b.co', '', ' ', 'x'.repeat(31), '1234', 'Alex\nBob'])('drops the name %j', (name) => {
    expect(readThanks({ name }).name).toBeNull()
  })

  it.each(['0', '-5', '1e3', '10.50', 'ten', '', '1234567', '$10'])('drops the amount %j', (amount) => {
    expect(readThanks({ amount }).amount).toBeNull()
  })

  it('drops a frequency it does not know, and reads the first of a repeated parameter', () => {
    expect(readThanks({ frequency: 'weekly' }).frequency).toBeNull()
    expect(readThanks({ name: ['Sam', 'Pat'] }).name).toBe('Sam')
    expect(readThanks({})).toEqual({ name: null, amount: null, frequency: null })
  })
})

describe('thanksText', () => {
  const words = {
    title: 'Thank you. You are part of WUWF now.',
    titleNamed: 'Thank you, {name}. You are part of WUWF now.',
    body: 'Your gift keeps WUWF on the air.',
    bodyMonthly: 'Your monthly gift of {amount} keeps WUWF on the air.',
    bodyOnce: 'Your gift of {amount} keeps WUWF on the air.',
  }

  it('names the donor and the gift when both are known', () => {
    expect(thanksText(words, { name: 'Alex', amount: 10, frequency: 'monthly' })).toEqual({ title: 'Thank you, Alex. You are part of WUWF now.', body: 'Your monthly gift of $10 keeps WUWF on the air.' })
    expect(thanksText(words, { name: null, amount: 60, frequency: 'once' }).body).toBe('Your gift of $60 keeps WUWF on the air.')
  })

  it('falls back to the plain wording rather than print a blank or a half-filled sentence', () => {
    expect(thanksText(words, { name: null, amount: null, frequency: null })).toEqual({ title: words.title, body: words.body })
    expect(thanksText(words, { name: null, amount: 10, frequency: null }).body).toBe(words.body)
    expect(thanksText(words, { name: null, amount: null, frequency: 'monthly' }).body).toBe(words.body)
  })
})

describe('other ways to give', () => {
  const groups: WayGroup[] = [
    { key: 'vehicles', label: 'Vehicle or boat', best: '', effort: '' },
    { key: 'assets', label: 'Stock, IRA or fund', best: '', effort: '' },
    { key: 'work', label: 'Through work', best: '', effort: '' },
  ]
  const panels: WayPanel[] = [
    { slug: 'stock', group: 'assets', tabLabel: 'Stock' },
    { slug: 'ira', group: 'assets', tabLabel: 'IRA gift' },
    { slug: 'vehicles', group: 'vehicles', tabLabel: '' },
    { slug: 'work', group: 'work', tabLabel: '' },
  ]

  it('opens the panel asked for, then the first panel of a group, then the first group', () => {
    expect(selectWay(panels, groups, 'ira')?.panel.slug).toBe('ira')
    expect(selectWay(panels, groups, 'assets')?.panel.slug).toBe('stock')
    expect(selectWay(panels, groups, undefined)?.panel.slug).toBe('vehicles')
    expect(selectWay(panels, groups, 'nonsense')?.panel.slug).toBe('vehicles')
    expect(selectWay(panels, groups, ' IRA ')?.panel.slug).toBe('ira')
  })

  it('lists the siblings of an open panel so a group with several can show its second row', () => {
    const open = selectWay(panels, groups, 'ira')!
    expect(open.group).toBe('assets')
    expect(open.siblings.map((p) => p.slug)).toEqual(['stock', 'ira'])
    expect(selectWay(panels, groups, 'work')!.siblings).toHaveLength(1)
  })

  it('has nothing to open when there are no panels', () => {
    expect(selectWay([], groups, 'ira')).toBeNull()
  })

  it('links a tab to its group\'s first panel', () => {
    expect(groupTarget(panels, 'assets')).toBe('stock')
    expect(groupTarget(panels, 'will')).toBeNull()
  })

  it('writes the details as plain lines for a broker, leaving out incomplete rows', () => {
    expect(
      detailsText([
        { label: 'Recipient', value: 'WUWF Public Radio' },
        { label: 'Tax ID', value: '' },
        { label: '', value: 'x' },
        { label: 'DTC number', value: '0725' },
      ]),
    ).toBe('Recipient: WUWF Public Radio\nDTC number: 0725')
  })
})

describe('the Ways to give strip', () => {
  it('lists the three pages, marks the current one, and uses the names the admin gives', () => {
    const items = givingNavItems('legacy', { give: 'Membership', legacy: 'Legacy giving' })
    expect(items.map((i) => i.href)).toEqual(['/support', '/support/legacy', '/support/ways'])
    expect(items.find((i) => i.current)?.label).toBe('Legacy giving')
    expect(items.map((i) => i.label)).toEqual(['Membership', 'Legacy giving', 'Other ways to give'])
    expect(GIVING_NAV_PAGES).not.toContain('thanks')
  })

  it('has a default title', () => {
    expect(givingNavTitle(null)).toBe('Ways to give')
    expect(givingNavTitle({ title: ' Give ' })).toBe('Give')
  })
})
