import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { GatherChoice } from './GatherChoice'

vi.mock('@/app/(frontend)/listens/actions', () => ({ sendHostRequest: vi.fn() }))
vi.mock('@/app/(frontend)/listens/kitchen-actions', () => ({ startKitchenTable: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))

const query = { publicId: 'abcdefghijkmnpqs', title: 'What did the storm leave?' }
const render = (mode: 'choose' | 'table' | 'request') => renderToStaticMarkup(createElement(GatherChoice, { mode, query }))

describe('Gather people', () => {
  it('asks the reader to choose, in plain terms, when the question allows both ways, and starts on the private table', () => {
    const html = render('choose')
    expect(html).toContain('Choose one')
    expect(html).toContain('Just a few of us, starting now')
    expect(html).toContain('A bigger group, a public gathering, or with WUWF’s help')
    expect(html.match(/type="radio"/g)).toHaveLength(2)
    expect(html).toContain('Start your table')
    expect(html).toContain('Start my table')
    expect(html).not.toContain('Send request')
  })

  it('has no choice to make, and shows the form directly, when only one way is allowed', () => {
    const table = render('table')
    expect(table).not.toContain('type="radio"')
    expect(table).toContain('Start my table')
    const request = render('request')
    expect(request).not.toContain('Choose one')
    expect(request).toContain('Tell us what you have in mind')
    expect(request).toContain('Send request')
  })

  it('names the question on the request form and never asks which question', () => {
    const request = render('request')
    expect(request).toContain('What did the storm leave?')
    expect(request).not.toContain('The question you would like to gather people around')
  })
})
