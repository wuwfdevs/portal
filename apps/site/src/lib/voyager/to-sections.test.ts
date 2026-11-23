import { describe, expect, it } from 'vitest'

import { voyagerPages, type VoyagerFacts } from './to-sections'

const facts: VoyagerFacts = {
  tagline: 'The student newspaper of the University of West Florida',
  leadId: 41,
  sections: [{ id: 1, title: 'Campus', slug: 'campus' }, { id: 2, title: 'Arts', slug: 'arts' }, { id: 3, title: 'Sports & Rec', slug: 'sports-and-rec' }],
  showIds: [9],
  staff: [{ name: 'Marisol Tran', role: 'Editor in chief', photoId: 5 }, { name: 'Jo Park', role: null, photoId: null }],
  join: { heading: 'Write for The Voyager', text: 'Any UWF student can join.', href: '/voyager/about#join' },
  footnote: 'The Voyager is written and edited by UWF students, with faculty advising. It is published on the WUWF platform; student editors make its editorial decisions.',
}
const { home, about } = voyagerPages(facts)
const all = JSON.stringify([home, about])

describe('the Voyager hub', () => {
  it('follows the board: the front page, a run for each section, video, the shows, the staff, join, support', () => {
    expect(home.sections.map((s) => s.blockType)).toEqual(['sectionFrontPage', 'sectionNewsRun', 'sectionNewsRun', 'sectionNewsRun', 'sectionList', 'sectionShowSpotlight', 'sectionProfileBand', 'sectionClosingBand', 'sectionSupport'])
  })
  it('has the strip the board draws: Front page, each section, Video, Shows, Staff, then the About page', () => {
    expect(home.sections.filter((s) => s.navLabel).map((s) => s.navLabel)).toEqual(['Front page', 'Campus', 'Arts', 'Sports & Rec', 'Video', 'Shows', 'Staff'])
    expect(home).toMatchObject({ path: '/voyager', navHidden: true })
    expect(about).toMatchObject({ path: '/voyager/about', navLabel: 'About', navHidden: false })
  })
  it('puts the featured story in the lead and lets the Briefing fill itself with the Voyager\'s newest', () => {
    expect(home.sections[0]).toMatchObject({ lead: 41, topStories: [] })
  })
  it('gives each section its own band, the first five stories (the lead on a row of its own) and the rest three', () => {
    const runs = home.sections.filter((s) => s.blockType === 'sectionNewsRun')
    expect(runs.map((r) => [r.section, r.count])).toEqual([[1, 5], [2, 3], [3, 3]])
    expect(runs.map((r) => r.tone)).toEqual(['grey', 'plain', 'grey'])
  })
  it('reads clips with no typed list, and draws only the shows the hub chose', () => {
    expect(home.sections[4]).toMatchObject({ source: 'clips', variant: 'rail' })
    expect(home.sections[5]).toMatchObject({ onlyShows: [9] })
  })
  it('copies the staff with their roles and photos', () => {
    expect(home.sections[6]).toMatchObject({ variant: 'roster', people: [{ name: 'Marisol Tran', role: 'Editor in chief', photo: 5 }, { name: 'Jo Park' }] })
  })
  it('loses no word the hub held', () => {
    for (const word of [facts.tagline, facts.join.heading, facts.join.text, facts.staff[0]!.name, facts.staff[0]!.role, facts.staff[1]!.name, facts.footnote]) expect(all, String(word)).toContain(String(word))
  })
  it('prints no bracketed canvas note and draws no section id twice', () => {
    expect(all).not.toMatch(/\[[A-Z][A-Z ,:]+\]/)
    const ids = [...home.sections, ...about.sections].map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('leaves out what has no words: no join button without an address, no shows or staff, a section with no usable address has no strip link', () => {
    const bare = voyagerPages({ ...facts, showIds: [], staff: [], join: { heading: 'Write for The Voyager', text: null, href: null }, sections: [{ id: 4, title: 'Odd', slug: 'Odd Name!' }] })
    expect(bare.home.sections.map((s) => s.blockType)).toEqual(['sectionFrontPage', 'sectionNewsRun', 'sectionList', 'sectionSupport'])
    expect(bare.home.sections[1]).not.toHaveProperty('navLabel')
  })
})

describe('the Voyager About page', () => {
  it('opens with the tagline on the teal tone, and carries the footnote under "A newsroom run by students"', () => {
    expect(about.sections[0]).toMatchObject({ blockType: 'sectionFeature', tone: 'teal', variant: 'split', headline: facts.tagline })
    expect(about.sections[1]).toMatchObject({ blockType: 'sectionText', heading: { title: 'A newsroom run by students' } })
    expect(JSON.stringify(about.sections[1])).toContain('student editors make its editorial decisions')
  })
  it('writes nothing for the canvas\'s history, roles and questions, whose words are placeholders', () => {
    expect(about.sections.map((s) => s.blockType)).toEqual(['sectionFeature', 'sectionText', 'sectionClosingBand', 'sectionSupport'])
  })
})
