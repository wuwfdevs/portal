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
