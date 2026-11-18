import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { donateConfigOf } from '@/lib/giving/content'
import { buildDonateModel } from '@/lib/giving/donate'
import { GIVING_STARTER } from '@/lib/giving/starter'
import type { SupportPage } from '@/payload-types'

// The giving pages are edited in the admin, so who may edit them, what an edit may contain, and that what is stored comes back as the
// Give card the donor sees, are tested against the real database.

let payload: Payload
let before: SupportPage
const staff = (roles: string[]) => ({ id: 1, collection: 'users', email: 's@wuwf.org', roles }) as never
const update = (data: Record<string, unknown>, user?: unknown) =>
  payload.updateGlobal({
    slug: 'support-page',
    data: data as never,
    context: { disableRevalidate: true },
    ...(user ? { overrideAccess: false, user: user as never } : { overrideAccess: true }),
  })
const level = (name: string, minimumMonthly: number, extra: Record<string, unknown> = {}) => ({ name, minimumMonthly, ...extra })

describe('giving pages', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    before = await payload.findGlobal({ slug: 'support-page', depth: 0, overrideAccess: true })
  }, 60_000)
  afterAll(async () => {
    // Put the global back as the migration left it, so a later test (or a person using this database) sees the starting content.
    await update({ ...GIVING_STARTER, donationForm: before.donationForm })
  })

  it('stores editable levels and reads them back publicly', async () => {
    await update({
      levels: [level('Member', 5, { emphasis: 'standard', benefits: [{ text: 'First.' }] }), level('Sustaining', 10, { emphasis: 'featured', giftBenefits: [{ text: 'Second.' }] })],
    })
    const page = await payload.findGlobal({ slug: 'support-page', overrideAccess: false })
    expect(page.levels?.map((l) => l.name)).toEqual(['Member', 'Sustaining'])
    expect(page.levels?.[1]?.emphasis).toBe('featured')
    expect(page.levels?.[0]?.benefits?.[0]?.text).toBe('First.')
  })

  it('needs a monthly minimum on every level, because a gift is placed in a level by it', async () => {
    await expect(update({ levels: [{ name: 'No minimum' }] })).rejects.toThrow()
    await expect(update({ levels: [level('Zero', 0)] })).rejects.toThrow()
  })

  it('lets membership staff, publishers and administrators edit, and no one else', async () => {
    const data = { serviceLine: 'Edited.' }
    await expect(update(data, staff(['membership']))).resolves.toBeDefined()
    await expect(update(data, staff(['publisher']))).resolves.toBeDefined()
    await expect(update(data, staff(['administrator']))).resolves.toBeDefined()
    await expect(update(data, staff(['editor']))).rejects.toThrow()
    await expect(update(data, staff(['sponsorship']))).rejects.toThrow()
    await expect(payload.updateGlobal({ slug: 'support-page', data: data as never, overrideAccess: false })).rejects.toThrow()
  })

  it.each(['javascript:alert(1)', 'http://insecure.example.org', '//evil.example.org', 'give now'])('refuses the address %j wherever an address is typed', async (bad) => {
    await expect(update({ donationForm: { address: bad } })).rejects.toThrow()
    await expect(update({ donationForm: { monthlyAddress: bad } })).rejects.toThrow()
    await expect(update({ donationForm: { onceAddress: bad } })).rejects.toThrow()
    await expect(update({ give: { faq: { items: [{ question: 'q', answer: 'a', linkLabel: 'l', linkHref: bad }] } } })).rejects.toThrow()
    await expect(update({ ways: { panels: [{ group: 'vehicles', slug: 'v', secondaryHref: bad }] } })).rejects.toThrow()
    await expect(update({ give: { more: { items: [{ title: 'x', href: bad }] } } })).rejects.toThrow()
    await expect(update({ ways: { panels: [{ group: 'vehicles', slug: 'v', buttonHref: bad }] } })).rejects.toThrow()
  })

  it('accepts an empty address (the button is then not shown)', async () => {
    await expect(update({ donationForm: { address: '' }, give: { more: { items: [{ title: 'x', href: '' }] } } })).resolves.toBeDefined()
  })

  it('only allows the choices the page knows how to draw for a way to give', async () => {
    await expect(update({ ways: { panels: [{ group: 'timeshare', slug: 'x' }] } })).rejects.toThrow()
    await expect(update({ ways: { groups: [{ key: 'timeshare', label: 'x' }] } })).rejects.toThrow()
  })

  it('turns what an editor stores into the Give card a donor sees', async () => {
    await update({
      levels: [
        level('Member', 5, { giftBenefits: [{ text: 'A thank-you' }] }),
        level('Sustaining', 10, { giftBenefits: [{ text: 'A thank-you' }, { text: 'NPR+' }] }),
        level('Day Sponsor', 15, { giftBenefits: [{ text: '{messages} on 88.1' }] }),
      ],
      messageTiers: [{ yearly: 180, count: 1 }, { yearly: 360, count: 2 }],
      donationForm: { address: 'https://give.example.org/form?code=abc', monthlyAddress: '', onceAddress: '', prefill: true, amountParam: 'amount', frequencyParam: 'freq' },
      give: { card: { monthlyAmounts: [{ amount: 15 }, { amount: 5 }, { amount: 30 }], monthlyDefault: 15, onceAmounts: [{ amount: 120 }], onceDefault: 120 } },
    })
    const page = await payload.findGlobal({ slug: 'support-page', depth: 0, overrideAccess: false })
    const cfg = donateConfigOf(page)!
    expect(cfg.frequencies.map((f) => [f.key, f.amounts])).toEqual([['monthly', [5, 15, 30]], ['once', [120]]])
    const monthly = buildDonateModel(cfg)[0]!
    expect(monthly.defaultKey).toBe('monthly-15')
    const at30 = monthly.options.find((o) => o.amount === 30)!
    expect(at30.benefits).toEqual(['2 short personal messages on 88.1'])
    const href = new URL(at30.href!)
    expect(href.searchParams.get('code')).toBe('abc')
    expect(href.searchParams.get('amount')).toBe('30')
    expect(href.searchParams.get('freq')).toBe('monthly')
  })

  it('sends monthly gifts to the sustaining form and one-time gifts to the one-time form, as stored', async () => {
    await update({
      levels: [level('Member', 5)],
      donationForm: { address: '', monthlyAddress: 'https://give.example.org/sustaining', onceAddress: 'https://give.example.org/one-time', prefill: false },
      give: { card: { monthlyAmounts: [{ amount: 10 }], monthlyDefault: 10, onceAmounts: [{ amount: 60 }], onceDefault: 60 } },
    })
    const model = buildDonateModel(donateConfigOf(await payload.findGlobal({ slug: 'support-page', depth: 0, overrideAccess: false }))!)
    expect(model.find((f) => f.key === 'monthly')!.options.map((o) => o.href)).toEqual(['https://give.example.org/sustaining', 'https://give.example.org/sustaining'])
    expect(model.find((f) => f.key === 'once')!.options.map((o) => o.href)).toEqual(['https://give.example.org/one-time', 'https://give.example.org/one-time'])
  })

  it('shows no card when no amounts are offered', async () => {
    await update({ give: { card: { monthlyAmounts: [], onceAmounts: [] } } })
    expect(donateConfigOf(await payload.findGlobal({ slug: 'support-page', depth: 0, overrideAccess: false }))).toBeNull()
  })
})
