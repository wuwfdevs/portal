import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { empty, failed, hub, ok } from '../listening-fixtures'
import { ListeningSessionsView } from './Component'

const sessions = { blockType: 'sectionListeningSessions', variant: 'sessions', heading: { title: 'Coming up' } }
const view = (block: Record<string, unknown>, load: Parameters<typeof ListeningSessionsView>[0]['load']) => renderToStaticMarkup(createElement(ListeningSessionsView, { block: block as never, load }))

describe('Coming up', () => {
  it('lists every public session with its seat link, whichever question it belongs to', () => {
    const html = view(sessions, ok)
    expect(html).toContain('Storm night')
    expect(html).toContain('href="/listens/events/e-band"')
    expect(html).toContain('Save a seat')
    expect(html).toContain('Open table')
    expect(html).toContain('href="/listens/events/e-own"')
    expect(html).toContain('See the session') // no seats left
  })
  it('names the question a session talks over, linking to it, when that question is open', () => {
    const html = view(sessions, ok)
    expect(html).toContain('About:')
    expect(html).toContain('href="/listens/q-campaign"')
    expect(html).toContain('What did the storm leave?')
  })
  it('says nothing about a question for a session that has none open here', () => {
    const html = view(sessions, ok)
    // e-own has no question: only the one session carries an "About" line
    expect(html.match(/About:/g)).toHaveLength(1)
  })
  it('says who hosts it', () => {
    const hosted = { kind: 'ok' as const, hub: { ...hub, events: [{ ...hub.events![1]!, organizerLabel: 'Friends of the Library' }] } }
    expect(view(sessions, hosted)).toContain('hosted by Friends of the Library')
  })
  it('draws nothing when there is nothing to offer, or the Portal could not be read', () => {
    expect(view(sessions, empty)).toBe('')
    expect(view(sessions, failed)).toBe('')
    expect(view(sessions, undefined)).toBe('')
  })
})
