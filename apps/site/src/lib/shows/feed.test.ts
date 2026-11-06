import { describe, expect, it } from 'vitest'

import { buildFeed, guidOf, itunesDuration, rfc822, xmlEscape, type FeedEpisode } from './feed'

const show = { title: 'The EcoMinutes', url: 'https://www.wuwf.org/show/the-ecominutes', feedUrl: 'https://www.wuwf.org/podcast/the-ecominutes/rss.xml', summary: 'Short stories & tips', authors: ['A Host'], imageUrl: 'https://www.wuwf.org/a.jpg' }
const ep = (over: Partial<FeedEpisode> = {}): FeedEpisode => ({
  id: 7,
  title: 'Sea <grass> & "you"',
  url: 'https://www.wuwf.org/show/the-ecominutes/2026-01-02/sea-grass',
  groveId: '00000172-aaaa-bbbb-cccc-000000000001',
  summary: 'Why it matters',
  publishedAt: '2026-01-02T15:00:00.000Z',
  audio: { url: 'https://www.wuwf.org/api/audio/file/a.mp3', mimeType: 'audio/mpeg', bytes: 1234, seconds: 125 },
  ...over,
})

describe('xmlEscape', () => {
  it('escapes the special characters and drops characters XML forbids', () => {
    expect(xmlEscape(`a & b < c > "d" 'e'`)).toBe('a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;')
    expect(xmlEscape('ok\u0000\u0008\u001Fdone')).toBe('okdone')
  })
})

describe('dates and lengths', () => {
  it('writes RFC 822 and never invents a date', () => {
    expect(rfc822('2026-01-02T15:00:00.000Z')).toBe('Fri, 02 Jan 2026 15:00:00 GMT')
    expect(rfc822(null)).toBeNull()
    expect(rfc822('not a date')).toBeNull()
  })
  it('writes H:MM:SS, and nothing for no length', () => {
    expect(itunesDuration(125)).toBe('0:02:05')
    expect(itunesDuration(3725)).toBe('1:02:05')
    for (const bad of [0, -1, null, undefined, Number.NaN]) expect(itunesDuration(bad)).toBeNull()
  })
})

describe('guidOf', () => {
  it("is Grove's contentId when there is one, else one made from the id, never the address", () => {
    expect(guidOf({ id: 7, groveId: 'g-1' })).toBe('g-1')
    expect(guidOf({ id: 7, groveId: null })).toBe('wuwf-episode-7')
  })
})

describe('buildFeed', () => {
  const xml = buildFeed(show, [ep(), ep({ id: 8, groveId: null, title: 'New one', publishedAt: '2025-12-01T00:00:00Z', audio: { url: 'https://x/y.wav', mimeType: 'audio/wav' } })])
  it('is RSS 2.0 with the iTunes channel tags', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<itunes:type>episodic</itunes:type>')
    expect(xml).toContain('<itunes:image href="https://www.wuwf.org/a.jpg"/>')
    expect(xml).toContain('<atom:link href="https://www.wuwf.org/podcast/the-ecominutes/rss.xml" rel="self"')
    expect(xml).toContain('<description>Short stories &amp; tips</description>')
    expect(xml).toContain('<lastBuildDate>Fri, 02 Jan 2026 15:00:00 GMT</lastBuildDate>')
  })
  it("gives each item Grove's guid as a non-permalink, an escaped title, an enclosure and a duration", () => {
    expect(xml).toContain('<guid isPermaLink="false">00000172-aaaa-bbbb-cccc-000000000001</guid>')
    expect(xml).toContain('<title>Sea &lt;grass&gt; &amp; &quot;you&quot;</title>')
    expect(xml).toContain('<enclosure url="https://www.wuwf.org/api/audio/file/a.mp3" length="1234" type="audio/mpeg"/>')
    expect(xml).toContain('<itunes:duration>0:02:05</itunes:duration>')
  })
  it('keeps order, makes a guid for a new episode, and omits what it does not know', () => {
    expect(xml.indexOf('Sea &lt;')).toBeLessThan(xml.indexOf('New one'))
    expect(xml).toContain('<guid isPermaLink="false">wuwf-episode-8</guid>')
    expect(xml).toContain('<enclosure url="https://x/y.wav" length="0" type="audio/wav"/>')
    expect(buildFeed({ ...show, imageUrl: null, authors: [] }, [])).not.toMatch(/itunes:image|itunes:author|lastBuildDate|<item>/)
  })

  it('carries season, episode and episode type when an episode has them, and nothing when it does not', () => {
    const tagged = buildFeed(show, [ep({ season: 1, episode: 0 }), ep({ id: 9, season: 1, episode: null, episodeType: 'trailer' }), ep({ id: 10, episodeType: 'full' })])
    expect(tagged).toContain('<itunes:season>1</itunes:season><itunes:episode>0</itunes:episode></item>')
    expect(tagged).toContain('<itunes:season>1</itunes:season><itunes:episodeType>trailer</itunes:episodeType></item>')
    expect(xml).not.toMatch(/itunes:season|itunes:episode>|itunes:episodeType/)
  })
})
