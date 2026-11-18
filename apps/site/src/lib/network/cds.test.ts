import { describe, expect, it } from 'vitest'

import { extractResources, parseDocumentsResponse, serviceIdFromHref } from './cds'

// Fixtures are built from the examples on the CDS profile pages (document, publishable, has-images, has-audio), read 2026-11-18, not from
// a live response: this repo has no site CDS key yet. When one exists, check these key names against a real document (ROADMAP: Network content).
const NOW = new Date('2026-11-18T12:00:00Z')

const image = (overrides: Record<string, unknown> = {}) => ({
  id: '5678',
  profiles: [{ href: '/v1/profiles/image', rels: ['type'] }],
  title: 'A beach after the storm',
  altText: 'Waves on an empty beach',
  producer: 'Jane Photographer',
  enclosures: [
    {
      href: 'https://npr-media-host.org/images/beach.jpg',
      hrefTemplate: 'https://npr-media-host.org/images/beach{?width,quality,format}',
      rels: ['standard', 'primary'],
      type: 'image/jpeg',
      width: 3342,
      height: 2505,
    },
  ],
  ...overrides,
})

const audio = (overrides: Record<string, unknown> = {}) => ({
  id: '9001',
  profiles: [{ href: '/v1/profiles/audio', rels: ['type'] }],
  title: 'The story, read aloud',
  duration: 184.4,
  isAvailable: true,
  enclosures: [{ href: 'https://npr-audio-host.org/story.mp3', type: 'audio/mpeg' }],
  ...overrides,
})

const story = (overrides: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  profiles: [{ href: '/v1/profiles/document' }, { href: '/v1/profiles/story', rels: ['type'] }],
  title: 'County commissioners weigh a beach plan',
  teaser: 'A vote could come next month.',
  publishDateTime: '2026-11-18T10:00:00Z',
  editorialLastModifiedDateTime: '2026-11-18T10:30:00Z',
  owners: [{ href: 'https://organization.api.npr.org/v4/services/s583' }],
  brandings: [{ href: 'https://organization.api.npr.org/v4/services/s583' }],
  webPages: [{ href: 'https://station.example.org/2026/11/18/beach-plan', rels: ['canonical'] }],
  images: [{ href: '#/assets/5678', rels: ['primary'] }],
  audio: [{ href: '#/assets/9001', rels: ['primary', 'headline'] }],
  assets: { '5678': image(), '9001': audio() },
  ...overrides,
})

const response = (...resources: unknown[]) => ({ resources })

describe('parseDocumentsResponse', () => {
  it('reads a story into a candidate, with the fields an editor needs', () => {
    const { candidates, restricted, malformed } = parseDocumentsResponse(response(story()), NOW)
    expect(restricted).toBe(0)
    expect(malformed).toBe(0)
    expect(candidates).toHaveLength(1)
    const c = candidates[0]
    expect(c).toMatchObject({
      cdsId: 'doc-1',
      title: 'County commissioners weigh a beach plan',
      teaser: 'A vote could come next month.',
      publishedAt: '2026-11-18T10:00:00Z',
      modifiedAt: '2026-11-18T10:30:00Z',
      ownerHrefs: ['https://organization.api.npr.org/v4/services/s583'],
      brandingHrefs: ['https://organization.api.npr.org/v4/services/s583'],
      canonicalUrl: 'https://station.example.org/2026/11/18/beach-plan',
    })
    expect(c.image).toMatchObject({ href: 'https://npr-media-host.org/images/beach.jpg', width: 3342, altText: 'Waves on an empty beach', credit: 'Jane Photographer' })
    expect(c.image?.hrefTemplate).toContain('{?width,quality,format}')
    expect(c.audio).toEqual({ href: 'https://npr-audio-host.org/story.mp3', mimeType: 'audio/mpeg', durationSeconds: 184 })
    expect(c.audioSkipped).toBeNull()
  })

  it('filters a restricted story out entirely: it is counted and its id kept, but nothing else about it', () => {
    const secret = story({
      id: 'doc-r',
      isRestrictedToAuthorizedOrgServiceIds: true,
      title: 'A restricted headline',
      teaser: 'A restricted teaser',
      webPages: [{ href: 'https://station.example.org/restricted-page', rels: ['canonical'] }],
    })
    const parsed = parseDocumentsResponse(response(secret, story()), NOW)
    expect(parsed.candidates.map((c) => c.cdsId)).toEqual(['doc-1'])
    expect(parsed.restricted).toBe(1)
    expect(parsed.restrictedIds).toEqual(['doc-r'])
    expect(parsed.seenIds).toEqual(['doc-r', 'doc-1'])
    // Only the id of a restricted story is kept: no headline, teaser, link or picture survives anywhere in the result.
    const everything = JSON.stringify(parsed)
    expect(everything).not.toContain('A restricted headline')
    expect(everything).not.toContain('A restricted teaser')
    expect(everything).not.toContain('restricted-page')
  })

  it('treats a false or missing restricted flag as open (only `true` restricts)', () => {
    const parsed = parseDocumentsResponse(response(story({ isRestrictedToAuthorizedOrgServiceIds: false }), story({ id: 'doc-2' })), NOW)
    expect(parsed.candidates).toHaveLength(2)
    expect(parsed.restricted).toBe(0)
  })

  it('drops a restricted picture and keeps the story', () => {
    const parsed = parseDocumentsResponse(response(story({ assets: { '5678': image({ isRestrictedToAuthorizedOrgServiceIds: true }), '9001': audio() } })), NOW)
    expect(parsed.candidates).toHaveLength(1)
    expect(parsed.candidates[0].image).toBeNull()
    expect(parsed.candidates[0].imageDroppedAsRestricted).toBe(true)
  })

  it('uses the primary image, not a logo or headshot listed first', () => {
    const doc = story({
      images: [
        { href: '#/assets/logo', rels: ['logo'] },
        { href: '#/assets/5678', rels: ['primary'] },
      ],
      assets: { logo: image({ id: 'logo', enclosures: [{ href: 'https://npr-media-host.org/logo.png' }] }), '5678': image(), '9001': audio() },
    })
    expect(parseDocumentsResponse(response(doc), NOW).candidates[0].image?.href).toBe('https://npr-media-host.org/images/beach.jpg')
  })

  it('refuses a picture that is not https', () => {
    const doc = story({ assets: { '5678': image({ enclosures: [{ href: 'http://insecure.example.org/a.jpg' }] }), '9001': audio() } })
    expect(parseDocumentsResponse(response(doc), NOW).candidates[0].image).toBeNull()
  })

  describe('audio', () => {
    const withAudio = (asset: Record<string, unknown>) => story({ assets: { '5678': image(), '9001': audio(asset) } })

    it('skips a tracked copy and says why when no clean one exists', () => {
      const doc = withAudio({ enclosures: [{ href: 'https://npr-audio-host.org/t.mp3', type: 'audio/mpeg', rels: ['tracked'] }] })
      const c = parseDocumentsResponse(response(doc), NOW).candidates[0]
      expect(c.audio).toBeNull()
      expect(c.audioSkipped).toBe('tracked')
    })

    it('prefers the clean enclosure over a tracked or sponsored one in the same asset', () => {
      const doc = withAudio({
        enclosures: [
          { href: 'https://npr-audio-host.org/tracked.mp3', rels: ['tracked'] },
          { href: 'https://npr-audio-host.org/sponsored.mp3', rels: ['sponsored'] },
          { href: 'https://npr-audio-host.org/clean.mp3', type: 'audio/mpeg' },
        ],
      })
      expect(parseDocumentsResponse(response(doc), NOW).candidates[0].audio?.href).toBe('https://npr-audio-host.org/clean.mp3')
    })

    it('skips premium audio', () => {
      const doc = withAudio({ enclosures: [{ href: 'https://npr-audio-host.org/p.mp3', rels: ['premium'] }] })
      expect(parseDocumentsResponse(response(doc), NOW).candidates[0].audioSkipped).toBe('premium')
    })

    it('skips audio that is not available yet, and audio past its stream expiry', () => {
      expect(parseDocumentsResponse(response(withAudio({ isAvailable: false })), NOW).candidates[0].audioSkipped).toBe('unavailable')
      expect(parseDocumentsResponse(response(withAudio({ streamExpirationDateTime: '2026-11-17T00:00:00Z' })), NOW).candidates[0].audioSkipped).toBe('expired')
      expect(parseDocumentsResponse(response(withAudio({ streamExpirationDateTime: '2026-11-19T00:00:00Z' })), NOW).candidates[0].audio).not.toBeNull()
    })

    it('skips restricted audio', () => {
      expect(parseDocumentsResponse(response(withAudio({ isRestrictedToAuthorizedOrgServiceIds: true })), NOW).candidates[0].audioSkipped).toBe('restricted')
    })

    it('does not pick promo or intro audio as the story audio', () => {
      const doc = story({
        audio: [{ href: '#/assets/9001', rels: ['promo'] }],
        assets: { '5678': image(), '9001': audio() },
      })
      const c = parseDocumentsResponse(response(doc), NOW).candidates[0]
      expect(c.audio).toBeNull()
    })
  })

  it('reports how far a response reaches, restricted and non-story documents included, and nothing else about them', () => {
    const parsed = parseDocumentsResponse(
      response(
        story({ id: 'a', publishDateTime: '2026-11-18T09:00:00Z' }),
        story({ id: 'r', isRestrictedToAuthorizedOrgServiceIds: true, publishDateTime: '2026-11-18T11:00:00Z', title: 'Restricted words' }),
        story({ id: 'p', profiles: [{ href: '/v1/profiles/podcast-episode', rels: ['type'] }], publishDateTime: '2026-11-18T10:00:00Z' }),
      ),
      NOW,
    )
    expect(parsed.newestPublishedAt).toBe('2026-11-18T11:00:00Z')
    expect(JSON.stringify(parsed)).not.toContain('Restricted words')
    expect(parseDocumentsResponse(response(), NOW).newestPublishedAt).toBeNull()
  })

  it('does not invent: a document with no id, or no title, is counted as malformed and dropped', () => {
    const parsed = parseDocumentsResponse(response({ title: 'No id' }, story({ id: 'doc-x', title: '  ' }), 'nonsense', story()), NOW)
    expect(parsed.malformed).toBe(3)
    expect(parsed.candidates.map((c) => c.cdsId)).toEqual(['doc-1'])
  })

  it('skips documents that are not stories, but trusts one with no profiles at all', () => {
    const podcast = story({ id: 'pod', profiles: [{ href: '/v1/profiles/podcast-episode', rels: ['type'] }] })
    const bare = story({ id: 'bare', profiles: undefined })
    const parsed = parseDocumentsResponse(response(podcast, bare), NOW)
    expect(parsed.notStory).toBe(1)
    expect(parsed.candidates.map((c) => c.cdsId)).toEqual(['bare'])
  })

  it('falls back to the short teaser, and leaves a bad date empty rather than guessing', () => {
    const c = parseDocumentsResponse(response(story({ teaser: undefined, shortTeaser: 'Short.', publishDateTime: 'last Tuesday' })), NOW).candidates[0]
    expect(c.teaser).toBe('Short.')
    expect(c.publishedAt).toBeNull()
  })
})

describe('extractResources', () => {
  it('names the keys it saw when the envelope is not recognised', () => {
    expect(() => extractResources({ list: { items: [] } })).toThrow(/top-level keys: list/)
    expect(() => extractResources([])).toThrow(/an array/)
  })

  it('treats an empty resources array as a legitimate empty answer', () => {
    expect(extractResources({ resources: [] })).toEqual([])
  })
})

describe('serviceIdFromHref', () => {
  it('takes the last path segment', () => {
    expect(serviceIdFromHref('https://organization.api.npr.org/v4/services/s583')).toBe('s583')
    expect(serviceIdFromHref('not a url')).toBeNull()
  })
})
