import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { empty, failed, hub, notSetUp, ok } from '../listening-fixtures'
import { testContext } from '../testing'
import { ListeningOpenSection, ListeningOpenView } from './Component'

const campaigns = { blockType: 'sectionListeningOpen', variant: 'campaigns', heading: { title: 'What we’re listening for right now' }, emptyText: 'No reporter has a question open right now.' }
const reporters = { blockType: 'sectionListeningOpen', variant: 'reporters', heading: { title: 'A reporter would like to hear from you', intro: 'One reporter, one story, a few minutes by voice or in writing.' }, voiceOnlyIntro: 'One reporter, one story, a few minutes by voice.' }
const view = (block: Record<string, unknown>, load: Parameters<typeof ListeningOpenView>[0]['load']) => renderToStaticMarkup(createElement(ListeningOpenView, { block: block as never, load }))

describe('Open questions: cards with sessions', () => {
  it('draws a card for each open question with one action, Answer, to the question’s page', () => {
    const html = view(campaigns, ok)
    expect(html).toContain('id="question-q-campaign"')
    expect(html).toContain('What did the storm leave?')
    expect(html).toContain('href="/listens/q-campaign"')
    expect(html).toContain('id="question-q-reporter"')
    expect(html).toContain('How is your insurance bill?')
    expect(html).toContain('href="/listens/q-reporter"')
  })
  it('puts nothing but Answer on a card as an action: sessions, tables and hosting are on the question’s page', () => {
    const html = view(campaigns, ok)
    expect(html).not.toContain('Join a session')
    expect(html).not.toContain('Talk it over')
    expect(html).not.toContain('table form')
    expect(html).not.toContain('/listens/host')
    expect(html).not.toContain('Save a seat')
  })
  it('says whether a session is coming up, linking to where the question’s sessions are, and plain text when there is none', () => {
    const html = view(campaigns, ok)
    expect(html).toContain('1 session coming up')
    expect(html).toContain('href="/listens/q-campaign#talk-it-over"')
    expect(html).toContain('No sessions yet.')
  })
  it('shows no count on an open question', () => {
    expect(view(campaigns, ok)).not.toMatch(/\b41\b/)
  })
  it('says so when the whole hub is empty, and draws nothing when it is not and there is no card', () => {
    expect(view(campaigns, empty)).toContain('No reporter has a question open right now.')
    const noCards = { kind: 'ok' as const, hub: { ...hub, open: [] } }
    expect(view(campaigns, noCards)).toBe('')
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
    renderToStaticMarkup(createElement(ListeningOpenView, { block: block as never, load, home: true }))
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
