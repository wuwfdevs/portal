import { describe, expect, it } from 'vitest'

import { convertShowPage } from './show'
import { convertStory } from './story'
import type { JsonObject } from './types'

const show = (over: JsonObject = {}): JsonObject => ({
  _template: '/media/show/audio/RadioShowPage.hbs',
  canonicalLink: 'https://www.wuwf.org/show/acoustic-interlude',
  contentId: '00000177-b32b-d5f4-a5ff-bbfb14780025',
  title: 'Acoustic Interlude | WUWF',
  description: '00000177-b32b-d5f4-a5ff-bbfb83ed0001',
  mediaSchedule: 'Sundays Noon - 4:00 p.m.',
  coverArt: [{ _template: '/core/image/Image.hbs', alt: 'Cover', image: { src: 'https://npr.brightspotcdn.com/ab/cd/cover.png' } }],
  fullDescription: [{ items: ["<p>WUWF's long running showcase.</p>"] }],
  main: [],
  nprShow: false,
  ...over,
})

describe('convertShowPage', () => {
  it('keeps the exact address and id, the schedule, the cover as a file to copy, and the description as a body', () => {
    const r = convertShowPage(show())
    if (r.status !== 'converted') throw new Error('expected converted')
    expect(r.show).toMatchObject({ path: '/show/acoustic-interlude', slug: 'acoustic-interlude', title: 'Acoustic Interlude', schedule: 'Sundays Noon - 4:00 p.m.', legacy: { groveId: '00000177-b32b-d5f4-a5ff-bbfb14780025', legacyPath: '/show/acoustic-interlude' } })
    expect(r.show.heroImage).toEqual({ $asset: 'https://npr.brightspotcdn.com/ab/cd/cover.png' })
    expect(r.show.assets).toHaveLength(1)
    expect(JSON.stringify(r.show.description)).toContain('long running showcase')
    expect(r.report.entries.map((e) => e.code)).toEqual(['show.description-is-an-id'])
  })
  it('does not archive an NPR-distributed show, and refuses a show with no id, address or name', () => {
    expect(convertShowPage(show({ nprShow: true })).status).toBe('skipped')
    for (const bad of [{ contentId: '' }, { canonicalLink: 'https://www.wuwf.org/show/a/b' }, { title: '' }] as JsonObject[]) expect(convertShowPage(show(bad)).report.status).toBe('exception')
  })
  it('is not a show when the template says it is not', () => {
    expect(convertShowPage({ _template: '/core/article/ArticlePage.hbs' }).status).toBe('skipped')
  })
})

describe('a radio episode through the story converter', () => {
  const episode = (over: JsonObject = {}): JsonObject => ({
    _template: '/media/episode/audio/RadioShowEpisodePage.hbs',
    canonicalLink: 'https://www.wuwf.org/show/acoustic-interlude/2026-10-03/josh-ritter',
    contentId: '000001a1-0323-d721-a3e9-8b23d20d0000',
    headline: 'Josh Ritter',
    subHeadline: 'Josh Ritter Plus More',
    description: 'Josh Ritter Plus More',
    datePublishedISO: '2026-10-04T05:01:00Z',
    dateModifiedISO: '2026-10-04T17:06:49.297Z',
    radioShowTitle: 'Acoustic Interlude',
    radioShowUrl: 'https://www.wuwf.org/show/acoustic-interlude',
    body: [{ items: ['<p>Idaho born.</p>'] }],
    audio: [{ _template: '/core/audio/HTML5AudioPlayer.hbs', duration: '24:13', id: 'a1', sources: [{ src: 'https://cpa.ds.npr.org/s673/audio/2024/04/randt2024.mp3', type: 'audio/mpeg' }] }],
    lead: [],
    nprShow: false,
    ...over,
  })
  it('becomes an audio story that belongs to its show, with the audio as its featured audio and no section', () => {
    const r = convertStory(episode())
    if (r.status !== 'converted') throw new Error('expected converted')
    expect(r.story).toMatchObject({ format: 'audio', path: '/show/acoustic-interlude/2026-10-03/josh-ritter', title: 'Josh Ritter', show: { path: '/show/acoustic-interlude', title: 'Acoustic Interlude' }, section: null })
    expect(r.story.featuredAudio).toEqual({ $asset: 'https://cpa.ds.npr.org/s673/audio/2024/04/randt2024.mp3' })
    expect(r.report.status).toBe('clean')
  })
  it('keeps the episode text, which Grove stores in `body`, not `articleBody` (it was once dropped without a word)', () => {
    const r = convertStory(episode())
    if (r.status !== 'converted') throw new Error('expected converted')
    expect(JSON.stringify(r.story.content)).toContain('Idaho born.')
  })
  it('reports an episode with no audio, and a page with no text, audio or picture as needing a person', () => {
    const noAudio = convertStory(episode({ audio: [] }))
    if (noAudio.status !== 'converted') throw new Error('expected converted')
    const codes = (r: typeof noAudio) => r.report.entries.map((e) => e.code)
    expect(codes(noAudio)).toContain('episode.no-audio')
    expect(codes(noAudio)).not.toContain('episode.hollow-page')
    expect(noAudio.report.status).toBe('clean')
    const hollow = convertStory(episode({ audio: null as never, body: null as never }))
    if (hollow.status !== 'converted') throw new Error('expected converted')
    expect(codes(hollow)).toEqual(expect.arrayContaining(['episode.no-audio', 'episode.hollow-page']))
    expect(hollow.report.status).toBe('review')
    expect(hollow.story.description).toBe('Josh Ritter Plus More')
  })
  it('finds the show from the address when the page does not name it', () => {
    const r = convertStory(episode({ radioShowUrl: undefined as never, radioShowTitle: undefined as never } as never))
    if (r.status !== 'converted') throw new Error('expected converted')
    expect(r.story.show).toEqual({ path: '/show/acoustic-interlude', title: null })
    expect(r.report.entries.map((e) => e.code)).toContain('episode.show-from-address')
  })
  it('is not archived when the show is NPR\'s, and is an exception when no show can be found at all', () => {
    expect(convertStory(episode({ nprShow: true })).status).toBe('skipped')
    expect(convertStory(episode({ canonicalLink: 'https://www.wuwf.org/odd/2026-10-03/x', radioShowUrl: '' })).report.status).toBe('exception')
  })
  it('an ordinary story has format web and no show', () => {
    const r = convertStory({ _template: '/core/article/ArticlePage.hbs', canonicalLink: 'https://www.wuwf.org/local-news/2020-01-01/x', contentId: 'c1', headline: 'X', sourceOrganizationName: 'WUWF', datePublishedISO: '2020-01-01T12:00:00Z', articleBody: [], lead: [], audio: [] })
    if (r.status !== 'converted') throw new Error('expected converted')
    expect(r.story).toMatchObject({ format: 'web', show: null })
  })
})

describe('a podcast (`/podcast/<slug>`) through the converters', () => {
  const podcast = (over: JsonObject = {}): JsonObject => ({
    _template: '/media/show/audio/PodcastPage.hbs',
    canonicalLink: 'https://www.wuwf.org/podcast/the-ecominutes',
    contentId: '00000194-cd59-d27a-afd7-cd79fb200000',
    headline: 'EcoMinutes',
    title: 'EcoMinutes | WUWF',
    description: 'An occasional series.',
    coverArt: [{ _template: '/core/image/Image.hbs', alt: '', image: { src: 'https://npr.brightspotcdn.com/44/47/ecologo1400a.png' } }],
    fullDescription: [{ items: ['<p>Dr. Enid Sisskin presents The EcoMinutes.</p>'] }],
    feedLink: '<link type="application/rss+xml" rel="alternate" title="EcoMinutes" href="https://www.wuwf.org/podcast/the-ecominutes/rss.xml">',
    main: [],
    nprShow: false,
    ...over,
  })
  const episode = (over: JsonObject = {}): JsonObject => ({
    _template: '/media/episode/audio/PodcastEpisodePage.hbs',
    canonicalLink: 'https://www.wuwf.org/podcast/the-ecominutes/2026-09-09/eco-rices-whale',
    contentId: '000001a0-8633-d332-ade7-f73f7ed60000',
    headline: "EcoMinutes: Protecting the Rice's whale",
    description: 'A conversation about the Rice’s whale.',
    datePublishedISO: '2026-05-27T12:46:00Z',
    dateModifiedISO: '2026-05-27T13:00:00Z',
    podcastTitle: 'EcoMinutes',
    podcastUrl: 'https://www.wuwf.org/podcast/the-ecominutes',
    authorName: 'Enid Sisskin',
    body: [{ items: ['<p>Dr. Enid Sisskin sat down with Christian Wagley.</p>'] }],
    audio: [{ _template: '/core/audio/HTML5AudioPlayer.hbs', duration: '29:23', id: 'a1', sources: [{ src: 'https://cpa.ds.npr.org/s673/audio/2026/09/riceswhalef-1-01.mp3', type: 'audio/mpeg' }] }],
    lead: [],
    nprShow: false,
    ...over,
  })

  it('a podcast page becomes a show at its exact /podcast address, and says that its feed address is not kept', () => {
    const r = convertShowPage(podcast())
    if (r.status !== 'converted') throw new Error('expected converted')
    expect(r.show).toMatchObject({ path: '/podcast/the-ecominutes', slug: 'the-ecominutes', title: 'EcoMinutes' })
    expect(JSON.stringify(r.show.description)).toContain('Enid Sisskin')
    const feed = r.report.entries.find((e) => e.code === 'show.feed-link-not-kept')
    expect(feed?.detail).toBe('https://www.wuwf.org/podcast/the-ecominutes/rss.xml')
  })
  it('a podcast episode becomes an audio story of its show, with its text, audio and byline', () => {
    const r = convertStory(episode())
    if (r.status !== 'converted') throw new Error('expected converted')
    expect(r.story).toMatchObject({ format: 'audio', path: '/podcast/the-ecominutes/2026-09-09/eco-rices-whale', show: { path: '/podcast/the-ecominutes', title: 'EcoMinutes' }, section: null })
    expect(JSON.stringify(r.story.content)).toContain('Christian Wagley')
    expect(r.story.featuredAudio).toEqual({ $asset: 'https://cpa.ds.npr.org/s673/audio/2026/09/riceswhalef-1-01.mp3' })
    expect(r.story.byline.people.map((p) => p.name)).toEqual(['Enid Sisskin'])
  })
  it('finds the show from the /podcast address, and does not archive an NPR podcast', () => {
    const r = convertStory(episode({ podcastUrl: undefined as never, podcastTitle: undefined as never } as never))
    if (r.status !== 'converted') throw new Error('expected converted')
    expect(r.story.show).toEqual({ path: '/podcast/the-ecominutes', title: null })
    expect(convertStory(episode({ nprShow: true })).status).toBe('skipped')
    expect(convertShowPage(podcast({ nprShow: true })).status).toBe('skipped')
  })
})

describe('which shows are syndicated', () => {
  it('marks a national or other-provider program syndicated and a station production original', async () => {
    const { SYNDICATED_SHOW_SLUGS, showKindOf } = await import('./syndicated')
    expect(SYNDICATED_SHOW_SLUGS.size).toBe(35)
    for (const slug of ['morning-edition', 'fresh-air', 'jazz-after-hours', 'the-thistle-shamrock', 'capital-report']) expect(showKindOf(slug)).toBe('syndicated')
    for (const slug of ['acoustic-interlude', 'classical-24', 'eco-minute', 'five-corners', 'jazz-with-dale-riegle', 'radiolive-encores', 'a-new-show']) expect(showKindOf(slug)).toBe('original')
  })
  it('puts the kind on the converted show, whatever the page\'s own NPR flag says', () => {
    const morning = convertShowPage(show({ canonicalLink: 'https://www.wuwf.org/show/morning-edition', contentId: 'c-me', title: 'Morning Edition | WUWF', nprShow: false }))
    if (morning.status !== 'converted') throw new Error('expected converted')
    expect(morning.show.kind).toBe('syndicated')
    const own = convertShowPage(show())
    if (own.status !== 'converted') throw new Error('expected converted')
    expect(own.show.kind).toBe('original')
  })
})
