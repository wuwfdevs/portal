import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { buildDonateModel, type DonateConfig } from '@/lib/giving/donate'

import { DonateCard } from './DonateCard'

const config = (form: DonateConfig['form']): DonateConfig => ({
  frequencies: [
    { key: 'monthly', label: 'Monthly', sub: 'Most useful', amounts: [5, 10], defaultAmount: 10 },
    { key: 'once', label: 'One time', sub: 'Give once', amounts: [60], defaultAmount: 60 },
  ],
  otherLabel: 'Other',
  titleMonthly: 'At {amount} a month',
  titleOnce: 'At {amount}',
  words: { one: 'A short personal message', many: '{count} short personal messages' },
  anyTitle: 'Any amount helps',
  anyBenefits: [],
  ctaMonthly: 'Give {amount} a month',
  ctaOnce: 'Give {amount}',
  ctaOther: 'Give another amount',
  levels: [{ name: 'Member', minimumMonthly: 5, giftBenefits: ['A thank-you and a tax receipt'] }],
  tiers: [],
  form,
})

const render = (form: DonateConfig['form']) =>
  renderToStaticMarkup(React.createElement(DonateCard, { frequencies: buildDonateModel(config(form)), note: 'A receipt follows.', unavailable: React.createElement('p', null, 'Call to give') }))

describe('DonateCard', () => {
  it('sends the chosen gift to the donation form and says what comes next', () => {
    const html = render({ address: 'https://give.example.org/form?code=abc', prefill: true, amountParam: 'amount', frequencyParam: 'freq' })
    expect(html).toContain('href="https://give.example.org/form?code=abc&amp;amount=10&amp;freq=monthly"')
    expect(html).toContain('Give $10 a month')
    expect(html).toContain('A receipt follows.')
    expect(html).not.toContain('Call to give')
  })

  it('draws no button, and says to call, while there is no donation form address', () => {
    const html = render({ address: '' })
    expect(html).toContain('Call to give')
    expect(html).not.toContain('Give $10 a month')
    expect(html).not.toContain('A receipt follows.')
  })

  it('offers how often and how much as real radio buttons with legends, starting on the default', () => {
    const html = render({ address: 'https://give.example.org/form' })
    expect(html).toContain('<legend class="sr-only">How often</legend>')
    expect(html).toContain('<legend class="sr-only">Amount</legend>')
    expect(html.match(/type="radio"/g)?.length).toBe(2 + 3) // two frequencies, then monthly's $5, $10 and Other
    expect(html).toMatch(/checked=""[^>]*value="monthly-10"|value="monthly-10"[^>]*checked=""/)
  })

  it('leaves out the frequency choice when only one is offered', () => {
    const one = buildDonateModel({ ...config({ address: 'https://give.example.org/form' }), frequencies: [{ key: 'monthly', label: 'Monthly', sub: '', amounts: [10], defaultAmount: 10 }] })
    expect(renderToStaticMarkup(React.createElement(DonateCard, { frequencies: one }))).not.toContain('How often')
  })
})
