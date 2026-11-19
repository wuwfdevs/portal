import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { testContext } from '../testing'
import { ThankYouSection } from './Component'

const block = {
  blockType: 'sectionThankYou',
  label: 'Thank you',
  title: 'Thank you. You are part of WUWF now.',
  titleNamed: 'Thank you, {name}. You are part of WUWF now.',
  body: 'Your gift keeps the station on the air.',
  bodyMonthly: 'Your monthly gift of {amount} is how the newsroom plans.',
  bodyOnce: 'Your gift of {amount} keeps the station on the air.',
  actions: [{ label: 'Listen live', href: '/listen' }],
  nextTitle: 'What happens next',
  next: [{ lead: 'This week.', text: 'A receipt arrives by email.' }],
  promptTitle: 'Make it monthly',
  promptLabel: 'Switch to monthly',
  promptHref: '/support',
}
const draw = (extra: Record<string, unknown> = {}, query?: Record<string, string | string[] | undefined>) =>
  renderToStaticMarkup(ThankYouSection({ block: { ...block, ...extra } as never, context: { ...testContext, ...(query ? { query } : {}) } }) as never)

describe('Thank-you section', () => {
  it('says thank you without claiming to know the gift when the address carries nothing', () => {
    const out = draw()
    expect(out).toContain('Thank you. You are part of WUWF now.')
    expect(out).toContain('Your gift keeps the station on the air.')
    expect(out.match(/<h1/g)).toHaveLength(1)
    expect(out).not.toContain('{name}')
    expect(out).not.toContain('{amount}')
  })
  it('names the donor and the gift from the query the route hands in', () => {
    const out = draw({}, { name: 'Maria', amount: '20', frequency: 'monthly' })
    expect(out).toContain('Thank you, Maria. You are part of WUWF now.')
    expect(out).toContain('Your monthly gift of $20 is how the newsroom plans.')
  })
  it('prints nothing it did not read strictly: a web address for a name, an amount that is not a number', () => {
    const out = draw({}, { name: 'http://evil.example', amount: '20.5x', frequency: 'weekly' })
    expect(out).not.toContain('evil.example')
    expect(out).toContain('Thank you. You are part of WUWF now.')
    expect(out).not.toContain('$20')
  })
  it('lists what happens next and the one prompt, with its link only when it is safe', () => {
    const out = draw()
    for (const s of ['What happens next', 'This week.', 'A receipt arrives by email.', 'Make it monthly', 'href="/support"', 'href="/listen"']) expect(out).toContain(s)
    expect(draw({ promptHref: 'javascript:alert(1)' })).not.toContain('javascript:')
  })
  it('draws nothing without a title', () => {
    expect(ThankYouSection({ block: { ...block, title: '', titleNamed: '' } as never, context: testContext })).toBeNull()
  })
})
