import { describe, expect, it } from 'vitest'

import { unearthingPages, type UnearthingFacts } from './to-sections'

const facts: UnearthingFacts = {
  title: 'Unearthing Florida',
  summary: 'Stories of Florida\'s buried and forgotten history.',
  dateline: 'Northwest Florida to the Keys',
  about: 'Unearthing Florida tells stories of the state\'s buried history.',
  collections: [{ title: 'Forts and frontiers', slug: 'forts-and-frontiers', summary: 'Five episodes about forts.' }, { title: 'Storms and rebuilding', slug: 'storms', summary: null }],
  showPath: '/shows/unearthing-florida',
}
const all = JSON.stringify(unearthingPages(facts))

describe('Unearthing Florida\'s pages', () => {
  const [home, about] = unearthingPages(facts)
  it('makes the show\'s home (no address of its own, left out of the strip) and an About page at the show\'s address', () => {
    expect(home).toMatchObject({ isShowHome: true, navHidden: true, path: null, title: 'Unearthing Florida' })
    expect(about).toMatchObject({ isShowHome: false, navHidden: false, path: '/shows/unearthing-florida/about', navLabel: 'About' })
    expect(unearthingPages(facts)).toHaveLength(2)
  })
  it('follows the board: the lead, new this month, Explore, collections, Support', () => {
    expect(home!.sections.map((s) => s.blockType)).toEqual(['sectionFeature', 'sectionList', 'sectionExplore', 'sectionCards', 'sectionSupport'])
  })
  it('names the places the strip links to: Episodes, Explore, Collections, each with an anchor', () => {
    const named = home!.sections.filter((s) => s.navLabel).map((s) => [s.navLabel, s.anchor])
    expect(named).toEqual([['Episodes', 'episodes'], ['Explore', 'explore'], ['Collections', 'collections']])
  })
  it('leads with the show\'s newest episode (so the page does not repeat the name the strip carries) and lists the show\'s own, without typing a show or an episode anywhere', () => {
    const lead = home!.sections[0]!
    expect(lead).toMatchObject({ latestEpisode: true, variant: 'split', pageTitle: true, label: 'Northwest Florida to the Keys', line: facts.summary })
    expect(lead).not.toHaveProperty('playLatest')
    expect(home!.sections[1]).toMatchObject({ source: 'episodes', count: 3 })
    expect(home!.sections[1]).not.toHaveProperty('show')
  })
  it('says what the show is under the Explore heading, since the lead is an episode now', () => {
    expect(home!.sections[2]).toMatchObject({ heading: { title: 'Every site, by place and by time', intro: facts.summary } })
    const bare = unearthingPages({ ...facts, summary: null })[0]!
    expect(bare.sections[2]!.heading).not.toHaveProperty('intro')
  })
  it('makes a card for each collection with a link to it, and types no count', () => {
    const cards = (home!.sections[3] as { cards: Array<Record<string, string>> }).cards
    expect(cards.map((c) => [c.title, c.href])).toEqual([['Forts and frontiers', '/series/forts-and-frontiers'], ['Storms and rebuilding', '/series/storms']])
    expect(cards[0]!.text).toBe('Five episodes about forts.')
    expect(cards[1]).not.toHaveProperty('text')
    expect(all).not.toMatch(/\d+ episodes/)
  })
  it('types no bracketed review note and no stand-in name or figure from the canvas', () => {
    expect(all).not.toMatch(/\[[A-Z ]+\]/)
    expect(all).not.toMatch(/Judy Bense|104|142/)
  })
  it('keeps every word the old hub held: the dateline, the summary and "About the project"', () => {
    for (const w of [facts.dateline!, facts.summary!, facts.about!]) expect(all).toContain(w.replace(/'/g, "'"))
  })
  it('leaves out what it has no words for: no About page without about words, no collections section without collections, no label without a dateline', () => {
    const bare = unearthingPages({ ...facts, about: null, dateline: ' ', summary: null, collections: [] })
    expect(bare).toHaveLength(1)
    expect(bare[0]!.sections.map((s) => s.blockType)).toEqual(['sectionFeature', 'sectionList', 'sectionExplore', 'sectionSupport'])
    expect(bare[0]!.sections[0]).not.toHaveProperty('label')
    expect(bare[0]!.sections[0]).not.toHaveProperty('line')
  })
  it('gives each section a distinct id and anchors only where the strip links', () => {
    const ids = home!.sections.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(home!.sections.filter((s) => s.anchor).length).toBe(3)
  })
})
