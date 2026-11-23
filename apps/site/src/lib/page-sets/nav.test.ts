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

describe('setNavItems for a hub: a page\'s sections can ask for a link, and a show\'s home has the show\'s address', () => {
  const home = {
    title: 'Unearthing Florida', isShowHome: true, navHidden: true, navOrder: 1,
    sections: [{ anchor: 'episodes', navLabel: 'Episodes' }, { anchor: 'explore', navLabel: 'Explore' }, { anchor: 'quiet' }, { anchor: 'gone', navLabel: 'Gone', hidden: true }, { anchor: 'collections', navLabel: 'Collections' }],
  }
  const about = { title: 'About', path: '/shows/unearthing-florida/about', navOrder: 2 }
  const showPath = '/shows/unearthing-florida'
  it('lists the home page\'s own parts as in-page links on the home page, without a link for the hidden home itself, then the other pages', () => {
    expect(setNavItems([about, home], showPath, { showPath }).map((i) => [i.label, i.href, Boolean(i.current)])).toEqual([
      ['Episodes', '#episodes', false], ['Explore', '#explore', false], ['Collections', '#collections', false], ['About', '/shows/unearthing-florida/about', false],
    ])
  })
  it('points the same links at the show\'s address from another of its pages, and marks that page current', () => {
    const items = setNavItems([home, about], '/shows/unearthing-florida/about', { showPath })
    expect(items.map((i) => i.href)).toEqual(['/shows/unearthing-florida#episodes', '/shows/unearthing-florida#explore', '/shows/unearthing-florida#collections', '/shows/unearthing-florida/about'])
    expect(items.filter((i) => i.current).map((i) => i.label)).toEqual(['About'])
  })
  it('lists a home page that is not hidden at the show\'s address, and leaves out a section with no anchor, a hidden one or a bad anchor', () => {
    const visible = { ...home, navHidden: false, sections: [{ anchor: 'Bad Anchor', navLabel: 'Bad' }, { navLabel: 'No anchor' }] }
    expect(setNavItems([visible, about], '/elsewhere', { showPath }).map((i) => [i.label, i.href])).toEqual([['Unearthing Florida', showPath], ['About', '/shows/unearthing-florida/about']])
  })
  it('has no strip when the show\'s home has no address to point at, or there are fewer than two links', () => {
    expect(setNavItems([home], showPath, { showPath: null })).toEqual([])
    expect(setNavItems([{ ...home, sections: [{ anchor: 'episodes', navLabel: 'Episodes' }] }], showPath, { showPath })).toEqual([])
  })
  it('leaves out a page that asks not to be listed, with its sections', () => {
    expect(setNavItems([{ ...about, noindex: true, sections: [{ anchor: 'x', navLabel: 'X' }] }, home], showPath, { showPath }).map((i) => i.label)).toEqual(['Episodes', 'Explore', 'Collections'])
  })
})

