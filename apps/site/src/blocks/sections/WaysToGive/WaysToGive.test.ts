import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { testContext } from '../testing'
import { WaysToGiveSection } from './Component'

let settings: Record<string, unknown> = {}
vi.mock('@/lib/giving/load', () => ({ loadGivingSettings: async () => settings }))

const block = {
  blockType: 'sectionWaysToGive',
  label: 'Other ways to give',
  headline: 'Give in the way that fits your life',
  line: 'Choose one.',
  groups: [
    { key: 'vehicles', label: 'Vehicle or boat', best: 'You have one to part with.', effort: 'One phone call' },
    { key: 'assets', label: 'Stock, IRA or fund', best: 'You hold shares.', effort: 'A form' },
  ],
  panels: [
    { group: 'vehicles', slug: 'vehicles', title: 'Donate a vehicle', buttonLabel: 'Start', buttonHref: 'https://car.example.org/start', steps: 'Tell us about it\nWe arrange pickup\n\n', notes: 'Rules vary.' },
    { group: 'assets', slug: 'stock', tabLabel: 'Stock', title: 'Give stock', showDetails: true, steps: 'Call your broker', notes: '' },
    { group: 'assets', slug: 'ira', tabLabel: 'IRA gift', title: 'Give from an IRA', steps: 'Ask your custodian' },
  ],
  stepsTitle: 'How it works',
  detailsTitle: 'Give these to your broker',
  copyLabel: 'Copy',
}
const draw = async (extra: Record<string, unknown> = {}, query?: Record<string, string | string[] | undefined>) => {
  const out = await WaysToGiveSection({ block: { ...block, ...extra } as never, context: { ...testContext, ...(query ? { query } : {}) } })
  return out ? renderToStaticMarkup(out as never) : ''
}
beforeEach(() => {
  settings = { giftDetails: [{ label: 'Legal name', value: 'UWF Foundation' }, { label: '', value: 'x' }] }
})

describe('Ways to give section', () => {
  it('draws nothing without a headline', async () => {
    expect(await draw({ headline: '' })).toBe('')
  })
  it('opens the first choice by default, with every choice a plain link and one h1', async () => {
    const out = await draw()
    expect(out.match(/<h1/g)).toHaveLength(1)
    expect(out).toContain('Donate a vehicle')
    expect(out).not.toContain('Give stock')
    for (const slug of ['vehicles', 'stock']) expect(out).toContain(`href="/support/ways?way=${slug}"`)
    expect(out).toContain('aria-current="true"')
  })
  it('opens the panel the context’s query asks for, then the first panel of a group, and ignores a name that matches nothing', async () => {
    expect(await draw({}, { way: 'ira' })).toContain('Give from an IRA')
    const group = await draw({}, { way: 'assets' })
    expect(group).toContain('Give stock')
    expect(group).toContain('IRA gift')
    expect(await draw({}, { way: 'nonsense' })).toContain('Donate a vehicle')
    expect(await draw({}, { way: ['ira', 'stock'] })).toContain('Give from an IRA')
  })
  it('lists the steps as an ordered list, one to a line, and the notes only when the panel has some', async () => {
    const out = await draw()
    expect(out).toContain('<ol')
    for (const s of ['Tell us about it', 'We arrange pickup', 'Rules vary.']) expect(out).toContain(s)
    expect(await draw({}, { way: 'stock' })).not.toContain('Good to know')
  })
  it('shows the details to give a broker from the Giving settings, with the Copy button, only on a panel that asks for them', async () => {
    const out = await draw({}, { way: 'stock' })
    for (const s of ['Give these to your broker', 'Legal name', 'UWF Foundation', 'Copy']) expect(out).toContain(s)
    expect(out).not.toContain('>x<')
    expect(await draw()).not.toContain('UWF Foundation')
  })
  it('draws a button only when its address is safe', async () => {
    expect(await draw()).toContain('href="https://car.example.org/start"')
    const bad = await draw({ panels: [{ group: 'vehicles', slug: 'vehicles', title: 'T', buttonLabel: 'Go', buttonHref: 'javascript:alert(1)' }] })
    expect(bad).not.toContain('javascript:')
  })
})
