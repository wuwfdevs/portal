import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { testContext } from '../testing'
import { GivingContactSection } from './Component'

let settings: Record<string, unknown> = {}
vi.mock('@/lib/giving/load', () => ({ loadGivingSettings: async () => settings }))

const draw = async (block: Record<string, unknown>) => {
  const out = await GivingContactSection({ block: { blockType: 'sectionGivingContact', ...block } as never, context: testContext })
  return out ? renderToStaticMarkup(out as never) : ''
}
beforeEach(() => {
  settings = { phone: '850 473-7433', email: 'giving@wuwf.example' }
})

describe('Giving contact section', () => {
  it('draws the band with the call and email buttons from the settings', async () => {
    const out = await draw({ variant: 'band', headline: 'Talk to a person', line: 'We can help.', callLabel: 'Call {phone}', emailLabel: 'Email us' })
    for (const s of ['Talk to a person', 'We can help.', 'Call 850 473-7433', 'href="tel:+18504737433"', 'Email us', 'href="mailto:giving@wuwf.example"']) expect(out).toContain(s)
  })
  it('draws no button for a number or address the settings do not hold, and none without words', async () => {
    settings = { phone: '850 473-7433' }
    const out = await draw({ variant: 'band', headline: 'Talk', callLabel: 'Call {phone}', emailLabel: 'Email us' })
    expect(out).toContain('Call 850 473-7433')
    expect(out).not.toContain('Email us')
    expect(await draw({ variant: 'band', headline: 'Talk' })).not.toContain('tel:')
  })
  it('draws the hero with one h1 and a light card with the number and address', async () => {
    const out = await draw({ variant: 'hero', label: 'Legacy', headline: 'Leave a legacy', line: 'A plain page.', cardTitle: 'Talk to us', cardText: 'No pressure.', cardNote: 'We reply within two days', callLabel: 'Call us', emailLabel: 'Email us' })
    expect(out.match(/<h1/g)).toHaveLength(1)
    for (const s of ['Leave a legacy', 'Talk to us', 'No pressure.', '850 473-7433', 'giving@wuwf.example. We reply within two days', 'href="tel:+18504737433"']) expect(out).toContain(s)
  })
  it('draws the line with the number and address as links where its sentence puts them', async () => {
    const out = await draw({ variant: 'line', line: 'Questions? Call {phone} or write to {email}.' })
    expect(out).toContain('Questions? Call ')
    expect(out).toContain('href="tel:+18504737433"')
    expect(out).toContain('href="mailto:giving@wuwf.example"')
    expect(out).not.toContain('{phone}')
  })
  it('leaves out a token the settings cannot fill, and draws nothing without its words', async () => {
    settings = {}
    expect(await draw({ variant: 'line', line: 'Call {phone}.' })).not.toContain('{phone}')
    expect(await draw({ variant: 'line' })).toBe('')
    expect(await draw({ variant: 'band' })).toBe('')
    expect(await draw({ variant: 'hero' })).toBe('')
  })
})
