import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderToStaticMarkup } from 'react-dom/server'

import { testContext } from '../testing'
import { SupportSection } from './Component'

let global: unknown = null
let fail = false
vi.mock('@/utilities/getGlobals', () => ({
  getCachedGlobal: (slug: string) => async () => {
    if (slug !== 'giving-settings') throw new Error(`unexpected global ${slug}`)
    if (fail) throw new Error('database down')
    return global
  },
}))

const html = async (block: Record<string, unknown>) =>
  renderToStaticMarkup((await SupportSection({ block: { blockType: 'sectionSupport', ...block } as never, context: testContext })) as never)
const given = { heading: { title: 'Support the show', intro: 'Keep the music live.' } }

beforeEach(() => {
  global = { donationForm: { monthlyAddress: 'https://give.example.org/monthly' } }
  fail = false
})

describe('Support section', () => {
  it('draws nothing without a title', async () => {
    expect(await html({})).toBe('')
  })
  it('draws the title, the sentence and a button to the donation form from the global', async () => {
    const out = await html({ ...given, tone: 'dark', note: 'You go to WUWF\'s secure form.' })
    expect(out).toContain('data-tone="dark"')
    expect(out).toContain('Support the show')
    expect(out).toContain('href="https://give.example.org/monthly"')
    expect(out).toContain('Become a member')
    expect(out).toContain('secure form')
  })
  it('uses the block\'s own button words', async () => {
    expect(await html({ ...given, label: 'Give monthly' })).toContain('Give monthly')
  })
  it('draws nothing when the form address is not set, is unsafe, or the global cannot be read', async () => {
    global = { donationForm: { monthlyAddress: '' } }
    expect(await html(given)).toBe('')
    global = { donationForm: { monthlyAddress: 'javascript:alert(1)' } }
    expect(await html(given)).toBe('')
    global = null
    expect(await html(given)).toBe('')
    fail = true
    expect(await html(given)).toBe('')
  })
  it('never carries an amount or a payment field', async () => {
    const out = await html(given)
    expect(out).not.toMatch(/<input|<form|amount=/i)
  })
})
