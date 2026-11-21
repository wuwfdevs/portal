import { describe, expect, it } from 'vitest'

import { SECTION_BLOCKS } from '@/blocks/sections/registry'
import { duplicateAnchors } from '@/lib/sections-anchors'

import { PODCASTS_WORDS, SCHEDULE_WORDS } from './starter'
import { PODCASTS_PATH, SCHEDULE_PATH, stationPagesFrom } from './to-sections'

const ways = [
  { title: 'On the radio', text: 'Tune to 88.1 FM.', linkLabel: 'Find us', linkUrl: '/schedule' },
  { title: 'On your phone', text: 'Use the app.', linkLabel: '', linkUrl: 'https://example.org/app' },
  { title: 'Smart speakers', text: 'Ask for WUWF.', linkLabel: 'How', linkUrl: '' },
  { title: '', text: 'No title is no card.' },
]
const pages = stationPagesFrom(ways)
const byPath = (p: string) => pages.find((x) => x.path === p)!
const everyWord = (value: unknown): string => JSON.stringify(value)

describe('station pages as sections', () => {
  it('writes the schedule and the podcast directory at their own addresses', () => {
    expect(pages.map((p) => p.path)).toEqual([SCHEDULE_PATH, PODCASTS_PATH])
    expect(pages.map((p) => p.slug)).toEqual(['schedule', 'podcasts'])
  })
  it('loses no word of the old pages', () => {
    const schedule = everyWord(byPath(SCHEDULE_PATH).sections)
    for (const w of [SCHEDULE_WORDS.eyebrow, SCHEDULE_WORDS.title, SCHEDULE_WORDS.line, SCHEDULE_WORDS.scheduleTitle, SCHEDULE_WORDS.waysTitle]) expect(schedule).toContain(JSON.stringify(w).slice(1, -1))
    const podcasts = everyWord(byPath(PODCASTS_PATH).sections)
    for (const w of [PODCASTS_WORDS.eyebrow, PODCASTS_WORDS.title, PODCASTS_WORDS.line, PODCASTS_WORDS.showsTitle, PODCASTS_WORDS.latestTitle]) expect(podcasts).toContain(JSON.stringify(w).slice(1, -1))
    expect(everyWord(byPath(SCHEDULE_PATH).sections)).toContain('Tune to 88.1 FM.')
  })
  it('keeps a card’s link only when it has both a label and an address, and drops a card with no title', () => {
    const cards = (byPath(SCHEDULE_PATH).sections.find((s) => s.blockType === 'sectionCards') as unknown as { cards: Record<string, unknown>[] }).cards
    expect(cards.map((c) => c.title)).toEqual(['On the radio', 'On your phone', 'Smart speakers'])
    expect(cards[0]).toMatchObject({ href: '/schedule', linkLabel: 'Find us' })
    expect(cards[1]).not.toHaveProperty('href')
    expect(cards[2]).not.toHaveProperty('linkLabel')
  })
  it('leaves out the other-ways section when there are no cards, as the old page did', () => {
    expect(stationPagesFrom([]).find((p) => p.path === SCHEDULE_PATH)!.sections.map((s) => s.blockType)).toEqual(['sectionFeature', 'sectionBroadcastSchedule'])
    expect(stationPagesFrom(null)[0]!.sections).toHaveLength(2)
  })
  it('uses only library blocks, each with a unique id and anchors unique on a page, and starts each page with its headline', () => {
    const library = new Set(SECTION_BLOCKS.filter((e) => !e.sets).map((e) => e.block.slug))
    const ids = new Set<string>()
    for (const p of pages) {
      expect(duplicateAnchors(p.sections as never), p.path).toEqual([])
      expect(p.sections[0]).toMatchObject({ blockType: 'sectionFeature', variant: 'hero' })
      expect(p.sections[0]!.headline, p.path).toBeTruthy()
      for (const s of p.sections) {
        expect(library.has(s.blockType), s.blockType).toBe(true)
        expect(ids.has(s.id)).toBe(false)
        ids.add(s.id)
      }
    }
  })
  it('lists the shows and then the newest episodes of all of them', () => {
    const [, shows, latest] = byPath(PODCASTS_PATH).sections
    expect(shows).toMatchObject({ blockType: 'sectionList', source: 'shows', variant: 'tiles' })
    expect(latest).toMatchObject({ blockType: 'sectionList', source: 'episodes', allShows: true, variant: 'rows', count: 12 })
  })
  it('keeps the old anchors: the week and the other ways', () => {
    expect(byPath(SCHEDULE_PATH).sections.map((s) => s.anchor)).toEqual([undefined, 'schedule', 'ways'])
  })
})
