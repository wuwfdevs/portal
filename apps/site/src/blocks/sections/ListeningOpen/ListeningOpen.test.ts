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

describe('Open questions: bands', () => {
  it('draws a band for each open question with every way in that it offers', () => {
    const html = view(campaigns, ok)
    expect(html).toContain('id="question-q-campaign"')
    expect(html).toContain('What did the storm leave?')
    expect(html).toContain('Answer on your own')
    expect(html).toContain('href="/listens/q-campaign"')
    expect(html).toContain('Join a session')
    expect(html).toContain('href="/listens/events/e-band"')
    expect(html).toContain('Save a seat')
    expect(html).toContain('id="table-q-campaign"')
    expect(html).toContain('Gather a few people.')
    expect(html).toContain('table form')
    expect(html).toContain('href="/listens/host?query=q-campaign"')
  })
  it('gives a question that invites nobody just its own way in, and every question a band', () => {
    const html = view(campaigns, ok)
    expect(html).toContain('id="question-q-reporter"')
    expect(html).toContain('How is your insurance bill?')
    expect(html).not.toContain('id="table-q-reporter"')
    expect(html).not.toContain('href="/listens/host?query=q-reporter"')
  })
  it('shows no count on an open question', () => {
    expect(view(campaigns, ok)).not.toMatch(/\b41\b/)
  })
  it('says so when the whole hub is empty, and draws nothing when it is not and there is no band', () => {
    expect(view(campaigns, empty)).toContain('No reporter has a question open right now.')
    const noBands = { kind: 'ok' as const, hub: { ...hub, open: [] } }
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

describe('Open questions: cards', () => {
  it('draws a card for each question, with its desk and its line, linking to it', () => {
    const html = view(reporters, ok)
    expect(html).toContain('How is your insurance bill?')
    expect(html).toContain('Coastal Futures · Leigh Ostrander')
    expect(html).toContain('href="/listens/q-reporter"')
    expect(html).toContain('What did the storm leave?')
  })
  it('uses the voice-only intro when no question takes a written answer, and the main intro when one does', () => {
    const voice = { kind: 'ok' as const, hub: { ...hub, open: hub.open.map((o) => ({ ...o, allowTextAnswers: false })) } }
    expect(view(reporters, voice)).toContain('a few minutes by voice.')
    expect(view(reporters, ok)).toContain('by voice or in writing.')
  })
  it('draws nothing when there is none, and does not repeat the not-set-up sentence the other layout says', () => {
    expect(view(reporters, empty)).toBe('')
    expect(view(reporters, notSetUp)).toBe('')
  })
})

describe('Open questions on the home page', () => {
  const homeView = (block: Record<string, unknown>, load: Parameters<typeof ListeningOpenView>[0]['load']) =>
    renderToStaticMarkup(createElement(ListeningOpenView, { block: block as never, load, KitchenTable: Table, home: true }))
  const many = (n: number) => ({
    kind: 'ok' as const,
    hub: { ...hub, open: Array.from({ length: n }, (_, i) => ({ ...hub.open[1]!, publicId: `q-${i + 1}`, title: `Question ${i + 1}` })) },
  })
  it('draws the reporters’ questions as cards, whatever layout was chosen, with "See all of WUWF Listens" in the heading row', () => {
    const html = homeView(campaigns, ok)
    expect(html).toContain('How is your insurance bill?')
    expect(html).toContain('href="/listens/q-reporter"')
    expect(html).not.toContain('id="campaign-c-1"')
    expect(html).not.toContain('table form')
    expect(html).toContain('See all of WUWF Listens')
    expect(html).toContain('href="/listens"')
  })
  it('shows at most three, leaving the rest to the hub', () => {
    const html = homeView(reporters, many(5))
    expect(html).toContain('Question 3')
    expect(html).not.toContain('Question 4')
  })
  it('draws nothing, never a message, when none is open or the Portal is not set up or cannot be read', () => {
    expect(homeView(reporters, empty)).toBe('')
    expect(homeView(campaigns, empty)).toBe('')
    expect(homeView(campaigns, notSetUp)).toBe('')
    expect(homeView(campaigns, failed)).toBe('')
    expect(homeView(reporters, undefined)).toBe('')
  })
  it('shows no count on an open question', () => {
    expect(homeView(reporters, ok)).not.toMatch(/\b41\b/)
  })
  it('is the home form when the page is in the home set', async () => {
    const out = await ListeningOpenSection({ block: campaigns as never, context: { ...testContext, setId: 'home', listeningHub: ok } })
    const html = renderToStaticMarkup(out as never)
    expect(html).toContain('See all of WUWF Listens')
    expect(html).not.toContain('id="campaign-c-1"')
  })
})
