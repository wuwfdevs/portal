import { describe, expect, it } from 'vitest'

import { setHomeHref, setNavItems, setNavTag } from './nav'

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


describe('a section whose strip link goes to a page of its own, and the strip\'s home', () => {
  const hub = {
    title: 'The Voyager', path: '/voyager', navHidden: true, navOrder: 1,
    sections: [
      { anchor: 'front', navLabel: 'Front page' },
      { anchor: 'campus', navLabel: 'Campus', navHref: '/campus' },
      { navLabel: 'Sports', navHref: '/sports' },
      { anchor: 'video', navLabel: 'Video', navHref: 'javascript:alert(1)' },
      { anchor: 'staff', navLabel: 'Staff', navHref: '#staff' },
      { anchor: 'gone', navLabel: 'Gone', navHref: '/gone', hidden: true },
    ],
  }
  const about = { title: 'About', path: '/voyager/about', navOrder: 2 }
  it('links a section that has a page to that page (with or without an anchor), and a section with none to its place on the page', () => {
    expect(setNavItems([hub, about], '/voyager').map((i) => [i.label, i.href])).toEqual([
      ['Front page', '#front'], ['Campus', '/campus'], ['Sports', '/sports'], ['Video', '#video'], ['Staff', '#staff'], ['About', '/voyager/about'],
    ])
  })
  it('does not take an unsafe address as a page, and never as a place on the page', () => {
    const items = setNavItems([hub, about], '/voyager')
    expect(items.find((i) => i.label === 'Video')?.href).toBe('#video')
    expect(items.some((i) => i.href.startsWith('javascript'))).toBe(false)
  })
  it('marks the page the reader is on, for a link to a page', () => {
    expect(setNavItems([hub, about], '/campus').find((i) => i.label === 'Campus')?.current).toBe(true)
    expect(setNavItems([hub, about], '/voyager').find((i) => i.label === 'Campus')?.current).toBe(false)
  })
  it('sends the strip\'s title to the set\'s first page, even a page left out of the strip, and not to the strip\'s first link', () => {
    expect(setHomeHref([about, hub])).toBe('/voyager')
    expect(setNavItems([about, hub], '/voyager')[0]?.href).toBe('#front')
    const show = { title: 'Unearthing Florida', isShowHome: true, navHidden: true, navOrder: 1, sections: [{ anchor: 'episodes', navLabel: 'Episodes' }] }
    expect(setHomeHref([{ title: 'About', path: '/shows/uf/about', navOrder: 2 }, show], { showPath: '/shows/uf' })).toBe('/shows/uf')
  })
  it('has no home for a set with no page that has an address, or only a page that asks not to be listed', () => {
    expect(setHomeHref([])).toBeNull()
    expect(setHomeHref([{ title: 'Thanks', path: '/support/thanks', noindex: true }])).toBeNull()
    expect(setHomeHref([{ title: 'Home', isShowHome: true }], { showPath: null })).toBeNull()
  })
})
