import { describe, expect, it } from 'vitest'

import { radioLiveNavItems } from './nav'

const empty = {
  artists: [],
  host: { kicker: null, heading: null, text: null, portrait: null, href: null },
  encores: { heading: null, text: null, linkLabel: null, href: null },
  support: { heading: null, text: null, buttonLabel: null, href: null, note: null },
  membership: null,
}

describe('RadioLive sub-navigation', () => {
  it('always offers Shows and Watch, and nothing that is not on the page', () => {
    expect(radioLiveNavItems(empty).map((i) => i.href)).toEqual(['#shows', '#watch'])
  })

  it('adds a section only when it renders', () => {
    const items = radioLiveNavItems({
      ...empty,
      artists: [{}] as never,
      encores: { ...empty.encores, text: 'Encores on the air' },
      host: { ...empty.host, heading: 'Hosted by' },
      support: { ...empty.support, heading: 'Give' },
    })
    expect(items.map((i) => i.label)).toEqual(['Shows', 'Watch', 'Artists', 'Encores', 'About', 'Support'])
  })

  it('lists Support for a membership level alone', () => {
    const membership = { heading: 'Level' } as never
    expect(radioLiveNavItems({ ...empty, membership }).map((i) => i.label)).toContain('Support')
  })
})
