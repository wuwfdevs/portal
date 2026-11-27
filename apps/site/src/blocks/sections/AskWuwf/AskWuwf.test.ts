import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { empty, failed, hub, ok } from '../listening-fixtures'
import { testContext } from '../testing'
import { AskWuwfSection, AskWuwfView, jumpLinksOf } from './Component'

vi.mock('@/components/Listening/AskWuwf', () => ({ AskWuwf: () => createElement('div', { id: 'ask' }, 'the form') }))

const Form = () => createElement('div', { id: 'ask' }, 'the form')
const block = { blockType: 'sectionAskWuwf', headline: 'Your questions shape our reporting.', label: 'WUWF Listens', line: 'Ask us something.\n\nA person reads every word.' }
const view = (b: Record<string, unknown>, load = ok) => renderToStaticMarkup(createElement(AskWuwfView, { block: { ...block, ...b } as never, load, AskForm: Form }))

describe('Ask WUWF section', () => {
  it('draws the label, the one h1, the paragraphs and the form', () => {
    const html = view({})
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toContain('Your questions shape our reporting.')
    expect(html).toContain('WUWF Listens')
    expect(html).toContain('A person reads every word.')
    expect(html).toContain('the form')
  })
  it('offers each link only when there is something to go to', () => {
    expect(jumpLinksOf(ok).map((l) => l.href)).toEqual(['#now', '#came-of-it', '#ask', '#table-q-campaign', '/listens/host'])
    expect(jumpLinksOf(empty).map((l) => l.href)).toEqual(['#ask', '/listens/host'])
    expect(jumpLinksOf(failed).map((l) => l.href)).toEqual(['#ask', '/listens/host'])
    expect(jumpLinksOf(undefined).map((l) => l.href)).toEqual(['#ask', '/listens/host'])
  })
  it('links "Host a table" only when some open question invites one', () => {
    const none = { kind: 'ok' as const, hub: { ...hub, open: hub.open.map((q) => ({ ...q, canHostTable: false })) } }
    expect(jumpLinksOf(none).map((l) => l.href)).toEqual(['#now', '#came-of-it', '#ask', '/listens/host'])
  })
  it('leaves the links out when the editor switched them off', () => {
    const html = view({ jumpLinks: false })
    expect(html).not.toContain('Ask WUWF something')
  })
  it('draws nothing without a headline', async () => {
    const out = await AskWuwfSection({ block: { blockType: 'sectionAskWuwf', headline: '  ' } as never, context: testContext })
    expect(out).toBeNull()
  })
  it('draws the section when asked through the page (the form is loaded then)', async () => {
    const out = await AskWuwfSection({ block: block as never, context: { ...testContext, listeningHub: ok } })
    expect(renderToStaticMarkup(out as never)).toContain('the form')
  })
})
