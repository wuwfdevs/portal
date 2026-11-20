import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { empty, failed, hub, ok } from '../listening-fixtures'
import { ListeningSessionsView } from './Component'

const Table = (({ campaign }: { campaign: { publicId: string } }) => createElement('form', { 'data-table': campaign.publicId }, 'table form')) as never
const sessions = { blockType: 'sectionListeningSessions', variant: 'sessions', heading: { title: 'Join a listening session' } }
const tables = { blockType: 'sectionListeningSessions', variant: 'tables', heading: { title: 'Host a table of your own' } }
const view = (block: Record<string, unknown>, load: Parameters<typeof ListeningSessionsView>[0]['load']) => renderToStaticMarkup(createElement(ListeningSessionsView, { block: block as never, load, KitchenTable: Table }))

describe('Sessions and tables', () => {
  it('sessions: a card for each public session that belongs to no campaign, with its seat link', () => {
    const html = view(sessions, ok)
    expect(html).toContain('Open table')
    expect(html).toContain('href="/listens/events/e-own"')
    expect(html).toContain('See the session') // no seats left
    expect(html).not.toContain('Storm night') // that one is in its campaign's band
  })
  it('sessions: says who hosts it', () => {
    const hosted = { kind: 'ok' as const, hub: { ...hub, events: [{ ...hub.events![1]!, organizerLabel: 'Friends of the Library' }] } }
    expect(view(sessions, hosted)).toContain('Hosted by Friends of the Library')
  })
  it('tables: the form for each campaign that is not already in a band', () => {
    const html = view(tables, ok)
    expect(html).toContain('data-table="c-2"')
    expect(html).not.toContain('data-table="c-1"')
  })
  it('draws nothing when there is nothing to offer, or the Portal could not be read', () => {
    for (const b of [sessions, tables]) {
      expect(view(b, empty)).toBe('')
      expect(view(b, failed)).toBe('')
      expect(view(b, undefined)).toBe('')
    }
  })
})
