import { describe, expect, it } from 'vitest'

import { setNavItems, setNavTag } from './nav'

describe('setNavItems', () => {
  const pages = [
    { title: 'Ways to give', path: '/support/ways', navOrder: 3 },
    { title: 'Give', navLabel: 'Support WUWF', path: '/support', navOrder: 1 },
    { title: 'Leave a legacy', path: '/support/legacy' },
    { title: 'Thank you', path: '/support/thanks', navOrder: 2 },
  ]
  it('orders by navOrder, pages with none last, labelled navLabel or title', () => {
    expect(setNavItems(pages, '/support').map((i) => [i.label, i.href])).toEqual([
      ['Support WUWF', '/support'], ['Thank you', '/support/thanks'], ['Ways to give', '/support/ways'], ['Leave a legacy', '/support/legacy'],
    ])
  })
  it('marks only the current page', () => {
    const items = setNavItems(pages, '/support/ways')
    expect(items.filter((i) => i.current).map((i) => i.href)).toEqual(['/support/ways'])
  })
  it('has no navigation for a set of one page, or of none', () => {
    expect(setNavItems([pages[0]], '/support/ways')).toEqual([])
    expect(setNavItems([], '/')).toEqual([])
  })
  it('leaves out pages without an address or a name, and tolerates nulls', () => {
    expect(setNavItems([{ title: 'No path' }, { path: '/x' }, null, undefined, { title: 'A', path: '/a' }, { title: 'B', path: '/b' }], '/a').map((i) => i.href)).toEqual(['/a', '/b'])
  })
  it('names the cache tag by set', () => {
    expect(setNavTag('giving')).toBe('page-set_giving')
  })
})
