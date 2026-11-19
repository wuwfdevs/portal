import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { testContext } from '../testing'
import { InquiryFormSection } from './Component'

let data = { settings: {} as Record<string, unknown>, programs: [], interests: [] as string[], budgets: [] as string[] }
vi.mock('@/lib/sponsorship/load', () => ({ loadSponsorshipSettings: async () => data }))
vi.mock('@/app/(frontend)/sponsor/actions', () => ({ submitInquiry: async () => ({ status: 'idle' }) }))

const draw = async (block: Record<string, unknown>) => {
  const out = await InquiryFormSection({ block: { blockType: 'sectionInquiryForm', ...block } as never, context: testContext })
  return out ? renderToStaticMarkup(out as never) : ''
}
beforeEach(() => {
  data = {
    settings: { phone: '850 473-7453', address: '11000 University Parkway', inquiryNotice: 'We use this to reply.', inquiryEmail: 'secret@example.org' },
    programs: [],
    interests: ['On air', 'Digital'],
    budgets: ['Under $1,000', '$1,000 to $5,000'],
  }
})

describe('Inquiry form section', () => {
  it('draws the heading, the contact details and the form with the choices from the settings', async () => {
    const out = await draw({ anchor: 'inquire', heading: { eyebrow: 'Get started', title: 'Get a proposal', intro: 'Tell us your goal.\n\nWe reply in two days.' }, contactTitle: 'Prefer to talk?', labels: { name: 'Your name' } })
    expect(out).toContain('id="inquire"')
    for (const s of ['Get started', 'Get a proposal', 'Tell us your goal.', 'We reply in two days.', 'Prefer to talk?', '850 473-7453', 'href="tel:+18504737453"', '11000 University Parkway', 'Your name', 'On air', 'Digital', 'Under $1,000', 'We use this to reply.']) expect(out).toContain(s)
  })
  it('never carries the staff-only address, even if it were in the data', async () => {
    expect(await draw({})).not.toContain('secret@example.org')
  })
  it('has a honeypot, a token field and a button even when the words are empty', async () => {
    const out = await draw({})
    expect(out).toContain('name="organization-url"')
    expect(out).toContain('name="form-token"')
    expect(out).toContain('Request a proposal')
    expect(out).toContain('type="submit"')
  })
  it('stores nothing: no collection, no browser storage', () => {
    const src = ['Component.tsx', 'Form.tsx'].map((f) => readFileSync(path.join(__dirname, f), 'utf8')).join('\n')
    expect(src).not.toMatch(/payload\.create|localStorage|sessionStorage|indexedDB/)
  })
})
