import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { ListeningHubEvent } from '@wuwf/portal-contracts'

import { TalkItOver } from './TalkItOver'

const session = (publicId: string, seatsLeft: number | null, organizerLabel: string | null = null): ListeningHubEvent => ({
  publicId,
  title: `Session ${publicId}`,
  startsAt: '2026-12-05T01:00:00.000Z',
  endsAt: '2026-12-05T03:00:00.000Z',
  placeName: 'Library',
  city: 'Pensacola',
  organizerLabel,
  seatsLeft,
  queryPublicId: 'abcdefghijkmnpqs',
})
const render = (props: Partial<Parameters<typeof TalkItOver>[0]> = {}) =>
  renderToStaticMarkup(createElement(TalkItOver, { publicId: 'abcdefghijkmnpqs', sessions: [], options: { table: true, request: true }, ...props }))

describe('Talk it over with others', () => {
  it('is a statement heading with the same intro everywhere, and an anchor on the page’s own band', () => {
    const band = render()
    expect(band).toContain('Talk it over with others')
    expect(band).not.toContain('Talk it over with others?')
    expect(band).toContain('Each table is recorded only with everyone’s agreement.')
    expect(band).toContain('id="talk-it-over"')
    expect(render({ variant: 'card' })).not.toContain('id="talk-it-over"')
  })

  it('offers one way to gather, a single button to the gather page, and says what comes next', () => {
    const html = render()
    expect(html.match(/Gather people/g)).toHaveLength(1)
    expect(html).toContain('href="/listens/abcdefghijkmnpqs/gather"')
    expect(html).toContain('A few neighbors, or a bigger group with WUWF’s help.')
  })

  it('words the hint for what the question allows, and offers no button when it allows nothing', () => {
    expect(render({ options: { table: true, request: false } })).toContain('your own table')
    expect(render({ options: { table: false, request: true } })).toContain('write back')
    const none = render({ options: { table: false, request: false } })
    expect(none).not.toContain('Gather people')
    expect(none).not.toContain('/gather')
  })

  it('lists each session with its place and a seat link, hosted by whoever hosts it, and a full one reads as a page to see', () => {
    const html = render({ sessions: [session('one', 4, 'Friends of the Library'), session('two', 0)] })
    expect(html).toContain('Session one, hosted by Friends of the Library')
    expect(html).toContain('href="/listens/events/one"')
    expect(html).toContain('Save a seat')
    expect(html).toContain('href="/listens/events/two"')
    expect(html).toContain('See the session')
    expect(html).toContain('Library')
  })

  it('draws no list when there are no sessions, only the way to gather', () => {
    const html = render()
    expect(html).not.toContain('<ul')
    expect(html).toContain('Gather people')
  })
})
