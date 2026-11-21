import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { testContext } from '../testing'
import { GiftCardSection } from './Component'

let settings: Record<string, unknown> = {}
vi.mock('@/lib/giving/load', () => ({ loadGivingSettings: async () => settings }))

const draw = async (block: Record<string, unknown>) => {
  const out = await GiftCardSection({ block: { blockType: 'sectionGiftCard', ...block } as never, context: testContext })
  return out ? renderToStaticMarkup(out as never) : ''
}
beforeEach(() => {
  settings = {
    phone: '850 473-7433',
    monthlyAmounts: [{ amount: 10 }, { amount: 20 }],
    onceAmounts: [{ amount: 60 }],
    monthlyDefault: 10,
    levels: [{ name: 'Sustaining Member', minimumMonthly: 10, giftBenefits: [{ text: 'A thank-you and a tax receipt' }] }],
    donationForm: { monthlyAddress: 'https://give.example.org/monthly', onceAddress: 'https://give.example.org/once', notSetUp: 'Online giving is being set up. Call {phone}.' },
  }
})

describe('Gift card section', () => {
  it('draws nothing without a headline', async () => {
    expect(await draw({ label: 'Give' })).toBe('')
  })
  it('draws the words, with the one h1 of the page, and the amounts from the Giving settings', async () => {
    const out = await draw({ label: 'Give to WUWF', headline: 'Paid for by the people who use it.', line: 'A monthly gift lets the station plan.', assurances: [{ text: 'Change or stop anytime' }], card: { monthlyLabel: 'Monthly' } })
    for (const s of ['Give to WUWF', 'Paid for by the people who use it.', 'A monthly gift lets the station plan.', 'Change or stop anytime', 'Monthly', '$10', '$20', 'At $10 a month', 'A thank-you and a tax receipt']) expect(out).toContain(s)
    expect(out.match(/<h1/g)).toHaveLength(1)
  })
  it('sends the Give button to the form for the frequency, and never draws a field for card, bank or payroll details', async () => {
    const out = await draw({ headline: 'Give' })
    expect(out).toContain('href="https://give.example.org/monthly"')
    expect(out).not.toMatch(/<input[^>]*(type="(text|tel|email|password|number)"|name="(card|account|routing|cvv))/i)
  })
  it('says to call, with the number as a link, and draws no button while there is no form address', async () => {
    settings = { ...settings, donationForm: { notSetUp: 'Online giving is being set up. Call {phone}.' } }
    const out = await draw({ headline: 'Give' })
    expect(out).toContain('Online giving is being set up. Call ')
    expect(out).toContain('href="tel:+18504737433"')
    expect(out).not.toContain('Give $10 a month')
  })
  it('draws the words alone when the settings offer no amounts', async () => {
    settings = { ...settings, monthlyAmounts: [], onceAmounts: [] }
    const out = await draw({ headline: 'Give', line: 'Words.' })
    expect(out).toContain('Words.')
    expect(out).not.toContain('Make a gift')
  })
  it('picks the note by whether the form takes the amount from the link', async () => {
    const card = { noteWithPrefill: 'Your amount is already chosen.', noteWithoutPrefill: 'Choose the amount again on the form.' }
    expect(await draw({ headline: 'Give', card })).toContain('Choose the amount again on the form.')
    settings = { ...settings, donationForm: { ...(settings.donationForm as object), prefill: true } }
    expect(await draw({ headline: 'Give', card })).toContain('Your amount is already chosen.')
  })
})
