import { describe, expect, it } from 'vitest'

import { episodeCountLine, inBounds, inWindowNote, matchesQuery, siteFeatures, sitesInView } from './filter'
import { coordinate, exploreEpisode, shapeExplore } from './shape'

const site = (id: number, name: string, extra: Record<string, unknown> = {}) => ({ id, name, place: 'Pensacola Bay', era: 'spanish', description: 'A fort.', latitude: 30.4, longitude: -87.2, ...extra })
const ep = (id: number, siteId: number | { id: number } | null, extra: Record<string, unknown> = {}) => ({ id, title: `Episode ${id}`, path: `/shows/uf/2026-01-0${id}/e${id}`, site: siteId, ...extra })

describe('shapeExplore', () => {
  const data = shapeExplore(
    [site(1, 'Mission San Luis'), site(2, 'Castillo de San Marcos', { latitude: null, longitude: null }), site(3, 'Empty site'), site(4, 'Bad', { latitude: 200, longitude: -87 }), { id: 5 }],
    [ep(1, 1, { period: 'first-spanish' }), ep(2, { id: 1 }, { yearStart: 1566 }), ep(3, 2), ep(4, null), ep(5, 99), { id: 6, site: 1 }, ep(7, 4)],
  )
  it('keeps the sites that have an episode, by name, and counts every episode with a title and a site', () => {
    expect(data.sites.map((s) => s.name)).toEqual(['Bad', 'Castillo de San Marcos', 'Mission San Luis'])
    expect(data.episodeCount).toBe(5)
  })
  it('gives a populated or a bare site relation its episodes, in the order given, with the years each stands for', () => {
    const luis = data.sites.find((s) => s.name === 'Mission San Luis')!
    expect(luis.episodes.map((e) => [e.id, e.span])).toEqual([['1', { from: 1513, to: 1763 }], ['2', { from: 1566, to: 1566 }]])
    expect(luis.era).toBe('Spanish colonial')
  })
  it('lists a site with no usable coordinates but does not map it', () => {
    expect(data.sites.find((s) => s.name === 'Castillo de San Marcos')).toMatchObject({ lat: null, lng: null })
    expect(data.sites.find((s) => s.name === 'Bad')).toMatchObject({ lat: null, lng: null })
    expect(coordinate(30.4, 90)).toBe(30.4)
    expect(coordinate('30', 90)).toBeNull()
    expect(coordinate(Infinity, 90)).toBeNull()
  })
  it('leaves out an episode with no title, no site, or an unsafe address', () => {
    expect(exploreEpisode({ id: 1, site: 1 })).toBeNull()
    expect(exploreEpisode({ id: 1, title: 'T' })).toBeNull()
    expect(exploreEpisode({ id: 1, title: 'T', site: 1, path: '//evil.example' })?.href).toBeNull()
    expect(exploreEpisode({ id: 1, title: 'T', site: 1, path: '/a' })?.href).toBe('/a')
  })
})

describe('sitesInView', () => {
  const data = shapeExplore(
    [site(1, 'Mound Key', { era: 'native', place: 'Estero Bay' }), site(2, 'Mission San Luis', { place: 'Tallahassee', latitude: 30.45, longitude: -84.35 }), site(3, 'Unplaced', { latitude: null, longitude: null })],
    [ep(1, 1, { yearStart: 1513, yearEnd: 1513 }), ep(2, 1, { yearStart: -800, yearEnd: -700 }), ep(3, 1), ep(4, 2, { period: 'first-spanish' }), ep(5, 3, { period: 'civil-war' })],
  )
  const all = { from: -10000, to: 2026 }
  it('filters the sites and each site\'s episodes by the window; an episode with no span is always in it', () => {
    const v = sitesInView(data.sites, { from: 1513, to: 1821 }, '', null)
    expect(v.map((x) => [x.site.name, x.inWindow.map((e) => e.id)])).toEqual([['Mission San Luis', ['4']], ['Mound Key', ['1', '3']]])
  })
  it('drops a site none of whose episodes fall in the window', () => {
    expect(sitesInView(data.sites, { from: 1861, to: 1865 }, '', null).map((x) => x.site.name)).toEqual(['Mound Key', 'Unplaced'])
    expect(sitesInView(data.sites, { from: 1900, to: 2000 }, '', null).map((x) => x.site.name)).toEqual(['Mound Key'])
  })
  it('searches name, place and era, every word', () => {
    const mound = data.sites.find((s) => s.name === 'Mound Key')!
    expect(matchesQuery(mound, 'mound estero')).toBe(true)
    expect(matchesQuery(mound, 'native key')).toBe(true)
    expect(matchesQuery(mound, 'tallahassee')).toBe(false)
    expect(matchesQuery(mound, '   ')).toBe(true)
    expect(sitesInView(data.sites, all, 'tallahassee', null).map((x) => x.site.name)).toEqual(['Mission San Luis'])
  })
  it('keeps to the part of the map in view, and never hides a site that has no place', () => {
    const west = { west: -88, south: 28, east: -86, north: 31 }
    expect(sitesInView(data.sites, all, '', west).map((x) => x.site.name)).toEqual(['Mound Key', 'Unplaced'])
    const mound = data.sites.find((s) => s.name === 'Mound Key')!
    expect(inBounds(mound, null)).toBe(true)
    // A view that crosses the antimeridian (west 170, east -170) holds 175 and -179 but not 0.
    const across = { west: 170, south: 0, east: -170, north: 90 }
    expect(inBounds({ ...mound, lng: 0, lat: 10 }, across)).toBe(false)
    expect(inBounds({ ...mound, lng: 175, lat: 10 }, across)).toBe(true)
    expect(inBounds({ ...mound, lng: -179, lat: 10 }, across)).toBe(true)
  })
  it('hands the map exactly the sites in the window that have coordinates, with their in-window and total counts', () => {
    const fc = siteFeatures(sitesInView(data.sites, { from: 1513, to: 1821 }, '', null))
    expect(fc.features.map((f) => [f.properties.name, f.properties.count, f.properties.total, f.geometry.coordinates])).toEqual([
      ['Mission San Luis', 1, 1, [-84.35, 30.45]], ['Mound Key', 2, 3, [-87.2, 30.4]],
    ])
  })
  it('says "2 of 9 episodes fall in 1513 – 1821" only when the window cuts the record', () => {
    expect(episodeCountLine(2, 9, '1513 – 1821')).toBe('2 of 9 episodes fall in 1513 – 1821')
    expect(episodeCountLine(1, 3, '1513')).toBe('1 of 3 episodes fall in 1513')
    expect(episodeCountLine(4, 4, '1513 – 1821')).toBe('4 episodes')
    expect(episodeCountLine(1, 1, 'x')).toBe('1 episode')
  })
  it('notes a pin with how many of its episodes the window holds', () => {
    expect(inWindowNote(2, 9)).toBe('2 of 9 episodes in this window')
    expect(inWindowNote(1, 1)).toBe('1 episode in this window')
    expect(inWindowNote(4, 4)).toBe('4 episodes in this window')
  })
})
