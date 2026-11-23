import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ExploreData } from '@/lib/explore/shape'

import { testContext } from '../testing'
import type { SectionContext } from '../types'
import { ExploreSection, ExploreView } from './Component'

const data: ExploreData = {
  episodeCount: 4,
  sites: [
    { id: '1', name: 'Mission San Luis', place: 'Tallahassee', era: 'Spanish colonial', description: 'A mission.', lat: 30.45, lng: -84.35, episodes: [{ id: '1', title: 'The council house', href: '/shows/uf/2026-01-01/council', span: { from: 1633, to: 1704 } }, { id: '2', title: 'Beads', href: null, span: { from: 1650, to: 1650 } }] },
    { id: '2', name: 'Mound Key', place: 'Estero Bay', era: 'Native', description: null, lat: null, lng: null, episodes: [{ id: '3', title: 'The shell mound', href: '/shows/uf/2026-01-02/mound', span: { from: -800, to: 1500 } }] },
  ],
}
let loaded: ExploreData | null = data
let fail = false
const loadExplore = vi.fn(async () => {
  if (fail) throw new Error('down')
  return loaded as ExploreData
})
// The map is loaded in the browser only (`next/dynamic`, no server render); under static rendering it stands as the empty space it fills before the script runs.
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@/lib/explore/load', () => ({ loadExplore: (...a: unknown[]) => (loadExplore as unknown as (...x: unknown[]) => unknown)(...a) }))

const block = { blockType: 'sectionExplore', tone: 'grey', heading: { eyebrow: 'Explore', title: 'Every site, by place and by time' } }
const draw = async (context: SectionContext = { ...testContext, setId: 'unearthing', show: { id: 7 } }) => {
  const out = await ExploreSection({ block: block as never, context })
  return out ? renderToStaticMarkup(out as never) : ''
}
beforeEach(() => {
  loaded = data
  fail = false
  loadExplore.mockClear()
  delete process.env.MAP_STYLE_URL
})
afterEach(() => {
  delete process.env.MAP_STYLE_URL
})

describe('Explore section', () => {
  it('draws nothing, and reads nothing, on a page that names no show', async () => {
    expect(await draw({ ...testContext, setId: 'unearthing' })).toBe('')
    expect(loadExplore).not.toHaveBeenCalled()
  })
  it('reads the page\'s show, and draws the band\'s heading, the sites, their places and eras, and the window', async () => {
    const out = await draw()
    expect(loadExplore).toHaveBeenCalledWith(7)
    expect(out).toContain('data-tone="grey"')
    expect(out).toContain('Every site, by place and by time')
    for (const w of ['Mission San Luis', 'Tallahassee · Spanish colonial', 'Mound Key', 'Estero Bay · Native', '2 sites in view and in this window', 'Time window', 'Search sites']) expect(out).toContain(w)
  })
  it('lists a site with no coordinates and says its location is not set, rather than putting it on the map', async () => {
    const out = await draw()
    expect(out).toContain('Location not set')
    expect(out.match(/Location not set/g)).toHaveLength(1)
  })
  it('counts a site\'s episodes in the window and in all', async () => {
    const out = await draw()
    expect(out).toContain('2 episodes')
    expect(out).toContain('1 episode')
  })
  it('gives the window one slider for each end, labelled and valued, reachable by keyboard', async () => {
    const out = await draw()
    expect(out).toContain('aria-label="Window starts"')
    expect(out).toContain('aria-label="Window ends"')
    expect(out.match(/role="slider"/g)).toHaveLength(2)
    expect(out.match(/tabindex="0"/g)!.length).toBeGreaterThanOrEqual(2)
    expect(out).toContain('10,000 BCE')
  })
  it('draws nothing for a show with no site, and when the read fails', async () => {
    loaded = { sites: [], episodeCount: 0 }
    expect(await draw()).toBe('')
    fail = true
    expect(await draw()).toBe('')
  })
  it('asks no map provider for anything: the view draws no address of a map, tile or font service', async () => {
    const out = await draw()
    expect(out).not.toMatch(/https?:\/\//)
  })
  it('passes the station\'s basemap address to the panel only when it is an https address', async () => {
    const seen: Array<string | null> = []
    const Panel = (props: { styleUrl: string | null }) => {
      seen.push(props.styleUrl)
      return null
    }
    const view = (styleUrl: string | null) => renderToStaticMarkup(ExploreView({ block: block as never, data, styleUrl, thisYear: 2026, Panel: Panel as never }) as never)
    expect(view(null)).toContain('data-tone="grey"')
    expect(view('https://tiles.example/style.json')).toContain('data-tone')
    expect(seen).toEqual([null, 'https://tiles.example/style.json'])
    // Through the block: an http address is never passed on.
    process.env.MAP_STYLE_URL = 'http://insecure.example/style.json'
    expect(await draw()).not.toContain('insecure.example')
  })
})
