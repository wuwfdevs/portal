import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { empty, failed, hub, notSetUp, ok } from '../listening-fixtures'
import { testContext } from '../testing'
import { ListeningOpenSection, ListeningOpenView } from './Component'

vi.mock('@/components/Listening/KitchenTable', () => ({ KitchenTable: () => createElement('form', { 'data-form': 'table' }, 'table form') }))

const Table = (() => createElement('form', { 'data-form': 'table' }, 'table form')) as never
const campaigns = { blockType: 'sectionListeningOpen', variant: 'campaigns', heading: { title: 'What we’re listening for right now' }, emptyText: 'No reporter has a question open right now.', tableText: 'Gather a few people.' }
const reporters = { blockType: 'sectionListeningOpen', variant: 'reporters', heading: { title: 'A reporter would like to hear from you', intro: 'One reporter, one story, a few minutes by voice or in writing.' }, voiceOnlyIntro: 'One reporter, one story, a few minutes by voice.' }
const view = (block: Record<string, unknown>, load: Parameters<typeof ListeningOpenView>[0]['load']) => renderToStaticMarkup(createElement(ListeningOpenView, { block: block as never, load, KitchenTable: Table }))

describe('Open questions: campaigns', () => {
  it('draws a band for the campaign with its question and every way in', () => {
    const html = view(campaigns, ok)
    expect(html).toContain('id="campaign-c-1"')
    expect(html).toContain('What did the storm leave?')
    expect(html).toContain('Answer on your own')
    expect(html).toContain('href="/listens/q-campaign"')
    expect(html).toContain('Join a session')
    expect(html).toContain('href="/listens/events/e-band"')
    expect(html).toContain('Save a seat')
    expect(html).toContain('id="table-c-1"')
    expect(html).toContain('Gather a few people.')
    expect(html).toContain('table form')
  })
  it('shows no count on an open question, and leaves the reporters’ own question to its own layout', () => {
    const html = view(campaigns, ok)
    expect(html).not.toMatch(/\b41\b/)
    expect(html).not.toContain('How is your insurance bill?')
  })
  it('says so when the whole hub is empty, and draws nothing when it is not and there is no band', () => {
    expect(view(campaigns, empty)).toContain('No reporter has a question open right now.')
    const noBands = { kind: 'ok' as const, hub: { ...hub, campaigns: [] } }
    expect(view(campaigns, noBands)).toBe('')
  })
  it('says why when the Portal is not set up or could not be read', () => {
    expect(view(campaigns, notSetUp)).toMatch(/not (yet )?set up|isn.t set up|not available/i)
    expect(view(campaigns, failed)).toContain('We couldn&#x27;t load the questions just now')
  })
  it('draws nothing without the hub (a cached page, or a preview)', async () => {
    const out = await ListeningOpenSection({ block: campaigns as never, context: testContext })
    expect(renderToStaticMarkup(out as never)).toBe('')
  })
})

describe('Open questions: reporters’ questions', () => {
  it('draws a card for a question that belongs to no campaign, with its desk and its line, linking to it', () => {
    const html = view(reporters, ok)
    expect(html).toContain('How is your insurance bill?')
    expect(html).toContain('Coastal Futures · Leigh Ostrander')
    expect(html).toContain('href="/listens/q-reporter"')
    expect(html).not.toContain('What did the storm leave?')
  })
  it('uses the voice-only intro when no question takes a written answer, and the main intro when one does', () => {
    expect(view(reporters, ok)).toContain('a few minutes by voice.')
    const written = { kind: 'ok' as const, hub: { ...hub, open: hub.open.map((o) => ({ ...o, allowTextAnswers: true })) } }
    expect(view(reporters, written)).toContain('by voice or in writing.')
  })
  it('draws nothing when there is none, and does not repeat the not-set-up sentence the other layout says', () => {
    expect(view(reporters, empty)).toBe('')
    expect(view(reporters, notSetUp)).toBe('')
  })
})
