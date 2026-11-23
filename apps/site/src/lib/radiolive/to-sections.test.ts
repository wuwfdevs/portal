import { describe, expect, it } from 'vitest'

import { radioLivePages, type RadioLiveFacts } from './to-sections'

// The words the coded hub's global held (its defaults, as WUWF has them) plus a membership level.
const facts: RadioLiveFacts = {
  tagline: 'Songwriters live from downtown Pensacola, on the air on 88.1 FM',
  heroPhotoId: 11,
  host: { kicker: 'On the air since 1988', heading: 'Hosted by Tanya Gallagher, with William Howell & The Coveralls', text: "A songwriters' show in front of a live audience in downtown Pensacola, broadcast on WUWF 88.1.", portraitId: 12, href: '/radiolive-story' },
  encores: { heading: 'The best past sets, Thursdays 7–8 p.m.', text: 'Except the first Thursday of the month, when RadioLive is live.', linkLabel: 'Open the audio archive', href: '/podcasts' },
  support: { heading: 'Keep the music live.', text: 'Direct your WUWF membership to RadioLive. It pays the artists, keeps the equipment current and keeps every show free on the air.', note: 'On the donation form, choose "Count my gift as support for RadioLive."' },
  membership: { heading: 'RadioLive 25', text: 'Twenty-five dollars a month. Members receive a ticket to every show.', contactName: 'the membership office', contactEmail: 'members@example.org', contactPhone: '850-555-0100', href: '/support' },
}
const { home, artists } = radioLivePages(facts)
const all = JSON.stringify([home, artists])

// Words the page does not carry on purpose (see the file's header): the old hub-wide "Plan your visit" is not in the facts at all, and the hub's own button addresses (the support
// button now gives through the donation form) are not words.
describe('the RadioLive page', () => {
  it('follows the board: the latest set, dates, past shows, artists, the host, Encores, Support', () => {
    expect(home.sections.map((s) => s.blockType)).toEqual(['sectionFeature', 'sectionDates', 'sectionList', 'sectionList', 'sectionProfileBand', 'sectionFeature', 'sectionSupport', 'sectionCallout'])
    expect(home.sections.map((s) => s.tone)).toEqual(['dark', 'plain', 'dark', 'grey', 'plain', 'teal', 'plain', 'grey'])
  })
  it('sends the strip\'s Artists link to the artists\' page, which is left out of the strip, so the strip has one Artists link', () => {
    expect(home.sections.find((s) => s.id === 'rl-artists')).toMatchObject({ navLabel: 'Artists', navHref: '/radiolive/artists' })
  })
  it('names the places the strip links to: Shows, Watch, Artists, About (the board\'s four), each with an anchor', () => {
    expect(home.sections.filter((s) => s.navLabel).map((s) => [s.navLabel, s.anchor])).toEqual([['Shows', 'shows'], ['Watch', 'watch'], ['Artists', 'artists'], ['About', 'about']])
  })
  it('follows the shows instead of typing them: the latest recorded set, RadioLive dates, past shows and artists from the shows', () => {
    expect(home.sections[0]).toMatchObject({ latestSet: true, variant: 'split', line: facts.tagline, image: 11 })
    expect(home.sections[1]).toMatchObject({ source: 'radiolive', variant: 'rows' })
    expect(home.sections[2]).toMatchObject({ source: 'performances', variant: 'grid' })
    expect(home.sections[3]).toMatchObject({ source: 'artists', variant: 'tiles', moreHref: '/radiolive/artists', moreLabel: 'All artists →' })
    for (const s of home.sections) expect(s).not.toHaveProperty('items')
  })
  it('loses no word the hub held (the dropped ones are named in the file\'s header)', () => {
    for (const word of [
      facts.tagline, facts.host.kicker, facts.host.heading, facts.host.text, facts.encores.heading, facts.encores.text, facts.encores.linkLabel,
      facts.support.heading, facts.support.text, facts.support.note, facts.membership!.heading, facts.membership!.text, facts.membership!.contactName, facts.membership!.contactEmail, facts.membership!.contactPhone,
    ]) expect(all, String(word)).toContain(JSON.stringify(word).slice(1, -1))
  })
  it('puts the host\'s portrait and story link in the About band, and the picture at the top in the lead', () => {
    expect(home.sections[4]).toMatchObject({ image: 12, moreLabel: 'The story of RadioLive', moreHref: '/radiolive-story' })
  })
  it('prints no bracketed canvas note and draws no section id twice', () => {
    expect(all).not.toMatch(/\[[A-Z][A-Z ,:]+\]/)
    const ids = [...home.sections, ...artists.sections].map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('types no count of shows or artists', () => {
    expect(all).not.toMatch(/\d+ (shows|artists|appearances)/)
  })
  it('leaves out a section whose words are empty, and the membership level when the hub has none', () => {
    const bare = radioLivePages({ ...facts, host: { ...facts.host, heading: null, text: null }, encores: { ...facts.encores, heading: null, text: null }, support: { ...facts.support, heading: null, text: null }, membership: null }).home
    expect(bare.sections.map((s) => s.blockType)).toEqual(['sectionFeature', 'sectionDates', 'sectionList', 'sectionList'])
  })
  it('has an artists page at /radiolive/artists with the index', () => {
    expect(artists).toMatchObject({ path: '/radiolive/artists', navLabel: 'All artists', navHidden: true })
    expect(artists.sections.map((s) => s.blockType)).toEqual(['sectionArtistIndex'])
  })
})
