import { describe, expect, it } from 'vitest'

import { SECTION_BLOCKS } from '@/blocks/sections/registry'

import { homepageToSections, type HomepageFields } from './to-sections'

const full: HomepageFields = {
  lead: { id: 11 },
  leadKicker: ' After Isaias ',
  topStories: [{ id: 12 }, 13],
  fellowshipFeature: { enabled: true, fellowship: { id: 5 }, story: 14 },
  newsModules: [
    { id: 'a', heading: 'Local News', section: { id: 1 }, count: 6, enabled: true },
    { id: 'b', heading: 'Held', section: 2, count: 5, enabled: false },
    { id: 'c', heading: 'Music & Arts', section: 3, count: 4 },
  ],
  videoRow: { enabled: true, series: 4, count: 8 },
  podcasts: { enabled: true, featuredShow: 21 },
  radioLive: { enabled: true },
  unearthing: { enabled: true, episode: 31 },
}

describe('homepageToSections', () => {
  const { sections, notCarried } = homepageToSections(full)
  const of = (blockType: string) => sections.filter((s) => s.blockType === blockType)

  it('writes the coded page\'s order: lead, feature, videos, a run per section, podcasts, panels', () => {
    expect(sections.map((s) => s.blockType)).toEqual(['sectionFrontPage', 'sectionFellowshipFeature', 'sectionList', 'sectionNewsRun', 'sectionNewsRun', 'sectionShowSpotlight', 'sectionFeaturePanels'])
  })
  it('keeps the lead, the kicker and every top story, as ids', () => {
    expect(of('sectionFrontPage')[0]).toMatchObject({ lead: 11, leadKicker: 'After Isaias', topStories: [12, 13] })
  })
  it('holds a news section\'s count to what a News run takes (3 to 7), so an old count of 8 still saves', () => {
    const runs = homepageToSections({ ...full, newsModules: [{ id: 'x', heading: 'Big', section: 1, count: 8 }, { id: 'y', heading: 'Small', section: 2, count: 1 }, { id: 'z', heading: 'None', section: 3 }] }).sections.filter((s) => s.blockType === 'sectionNewsRun')
    expect(runs.map((s) => s.count)).toEqual([7, 3, 5])
  })
  it('loses no news section that is switched on, keeps its heading and count, and leaves a held one out', () => {
    expect(of('sectionNewsRun').map((s) => [s.heading, s.section, s.count])).toEqual([[{ title: 'Local News' }, 1, 6], [{ title: 'Music & Arts' }, 3, 4]])
  })
  it('carries the feature, the videos, the podcasts and the panels\' choices', () => {
    expect(of('sectionFellowshipFeature')[0]).toMatchObject({ fellowship: 5, story: 14 })
    expect(of('sectionList')[0]).toMatchObject({ source: 'clips', count: 8, moreHref: '/video', series: 4 })
    expect(of('sectionShowSpotlight')[0]).toMatchObject({ featuredShow: 21 })
    expect(of('sectionFeaturePanels')[0]).toMatchObject({ radioLive: true, unearthing: true, unearthingEpisode: 31 })
  })
  it('leaves out what is switched off, and a section that has no section or heading', () => {
    const off = homepageToSections({ fellowshipFeature: { enabled: false, fellowship: 5 }, videoRow: { enabled: false }, podcasts: { enabled: false }, radioLive: { enabled: false }, unearthing: { enabled: false }, newsModules: [{ heading: 'No section' }, { section: 4, heading: ' ' }] })
    expect(off.sections.map((s) => s.blockType)).toEqual(['sectionFrontPage'])
  })
  it('writes only block types that are registered, each for the home set, with unique ids', () => {
    for (const s of sections) {
      const entry = SECTION_BLOCKS.find((e) => e.block.slug === s.blockType)
      expect(entry, s.blockType).toBeDefined()
      if (entry?.sets) expect(entry.sets, s.blockType).toContain('home')
    }
    expect(new Set(sections.map((s) => s.id)).size).toBe(sections.length)
  })
  it('says what the blocks do not carry over (the "Latest stories" stand-in), and carries a pinned video series', () => {
    expect(notCarried.join(' ')).toContain('Latest stories')
    expect(notCarried.join(' ')).not.toContain('series')
    expect(homepageToSections(null).sections.map((s) => s.blockType)).toEqual(['sectionFrontPage', 'sectionList', 'sectionShowSpotlight', 'sectionFeaturePanels'])
  })
})
