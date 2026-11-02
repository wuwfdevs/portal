import { describe, expect, it } from 'vitest'

import { convertStory } from './story'
import { lexicalProblems } from './lexical'
import type { ConvertedStory, JsonObject } from './types'

const link = (body: string, href: string): JsonObject => ({ _template: '/core/link/Link.hbs', body, href, extraAttributes: '', target: '_blank' })
const page = (extra: JsonObject = {}): JsonObject => ({
  _template: '/core/article/ArticlePage.hbs',
  canonicalLink: 'https://www.wuwf.org/local-news/2016-03-13/rubio-rallies-in-pensacola',
  contentId: '00000170-20c3-df2b-ab7b-b2cb3819024d',
  sourceOrganizationName: 'WUWF',
  headline: 'Rubio Rallies in Pensacola',
  description: 'The candidate came to town.',
  datePublishedISO: '2016-03-13T19:39:31Z',
  dateModifiedISO: '2016-03-14T01:03:45Z',
  authorName: 'Dave Dunwoody', authorTitle: 'Former Reporter', authorUrl: 'https://www.wuwf.org/people/dave-dunwoody',
  primarySection: [link('Local News', 'https://www.wuwf.org/local-news')],
  tags: [{ ...link('Marco Rubio', 'https://www.wuwf.org/tags/marco-rubio'), contentId: '00000177-b32b-d5f4-a5ff-bbfb31fb0080' }],
  articleBody: [{ items: ['<p>He spoke Saturday night.</p>'] }],
  lead: [], audio: [], ...extra,
})
const ok = (p: JsonObject, hosts: string[] = []) => {
  const r = convertStory(p, { embedHosts: hosts })
  if (r.status !== 'converted') throw new Error(`expected converted, got ${r.status}`)
  return r
}
const body = (s: ConvertedStory) => s.content.root.children

describe('identity and metadata', () => {
  it('keeps the exact path, the Grove id, and both dates from the page', () => {
    const { story } = ok(page())
    expect(story.path).toBe('/local-news/2016-03-13/rubio-rallies-in-pensacola')
    expect(story.slug).toBe('rubio-rallies-in-pensacola')
    expect(story.legacy).toEqual({ groveId: '00000170-20c3-df2b-ab7b-b2cb3819024d', legacyPath: story.path, modifiedAt: '2016-03-14T01:03:45Z' })
    expect(story.publishedAt).toBe('2016-03-13T19:39:31Z')
    expect(story.title).toBe('Rubio Rallies in Pensacola')
    expect(story.source).toBe('wuwf')
  })
  it('does not recompute the path: a trailing slash goes, nothing else is touched', () => {
    expect(ok(page({ canonicalLink: 'https://www.wuwf.org/2004-06-02/Mixed-Case_slug/' })).story.path).toBe('/2004-06-02/Mixed-Case_slug')
  })
  it('Grove\'s description becomes the SEO description, not a dek', () => {
    expect(ok(page()).story.description).toBe('The candidate came to town.')
  })
  it('carries the section with its path, and the topics with their slugs and Grove ids', () => {
    const { story } = ok(page())
    expect(story.section).toEqual({ title: 'Local News', path: '/local-news' })
    expect(story.topics).toEqual([{ title: 'Marco Rubio', slug: 'marco-rubio', groveId: '00000177-b32b-d5f4-a5ff-bbfb31fb0080' }])
  })
  it('decodes entities in the headline', () => {
    expect(ok(page({ headline: 'Rock &amp; Roll &#8211; Live' })).story.title).toBe('Rock & Roll – Live')
  })
  it('says when a story has no section or byline, and which secondary sections were not carried', () => {
    const r = ok(page({ primarySection: [], authorName: '', authorUrl: '', secondarySections: [{ _template: '/core/link/Link.hbs', body: 'Apple News' }] }))
    expect(r.story.section).toBeNull()
    expect(r.report.entries.map((e) => e.code)).toEqual(expect.arrayContaining(['section.none', 'byline.none', 'sections.secondary-not-migrated']))
  })
})

describe('who wrote it', () => {
  it('takes the author with the address-derived slug, and merges contributors without duplicating', () => {
    const { story } = ok(page({ contributors: [link('Anthony Potts', 'https://www.wuwf.org/people/anthony-potts'), link('Dave Dunwoody', 'https://www.wuwf.org/people/dave-dunwoody')] }))
    expect(story.byline.people).toEqual([
      { name: 'Dave Dunwoody', title: 'Former Reporter', slug: 'dave-dunwoody' },
      { name: 'Anthony Potts', slug: 'anthony-potts' },
    ])
  })
  it('uses the byline text when there is no author, and says so', () => {
    const r = ok(page({ authorName: '', authorUrl: '', bylineText: 'christian garman' }))
    expect(r.story.byline.people).toEqual([{ name: 'christian garman' }])
    expect(r.report.entries.map((e) => e.code)).toContain('byline.from-text')
  })
  it('registers the author photo as a file to copy', () => {
    const r = ok(page({ authorImage: { src: 'https://npr.brightspotcdn.com/52/d5/jane.jpg', width: '600', height: '800' } }))
    expect(r.story.byline.people[0]!.photo).toEqual({ $asset: 'https://npr.brightspotcdn.com/52/d5/jane.jpg' })
    expect(r.story.assets.map((a) => a.sourceUrl)).toContain('https://npr.brightspotcdn.com/52/d5/jane.jpg')
  })
})

describe('the body', () => {
  it('puts a paragraph back together when a link sits in the middle of it', () => {
    const { story } = ok(page({ articleBody: [{ items: ['<p>Learn more at '] }, { _template: '/core/enhancement/InlineEnhancement.hbs', items: [link('EJYC.org', 'http://EJYC.org')] }, { items: [' today.</p>'] }] }))
    expect(body(story)).toHaveLength(1)
    const p = body(story)[0]!
    expect((p.children as { type: string }[]).map((c) => c.type)).toEqual(['text', 'link', 'text'])
  })
  it('a heading object between chunks becomes a heading', () => {
    const { story } = ok(page({ articleBody: [{ items: ['<p>One.</p>'] }, { _template: '/core/enhancement/InlineEnhancement.hbs', items: [{ _template: '/core/text/RichTextHeading.hbs', tag: 'h3', text: '<b>What it says</b>' }] }, { items: ['<p>Two.</p>'] }] }))
    expect(body(story).map((n) => n.type)).toEqual(['paragraph', 'heading', 'paragraph'])
  })
  it('a block object ends the text around it, in order', () => {
    const photo = { _template: '/core/enhancement/Enhancement.hbs', item: [{ _template: '/core/figure/Figure.hbs', alt: 'A', image: { src: 'https://npr.brightspotcdn.com/a/b.jpg' } }] }
    const { story } = ok(page({ articleBody: [{ items: ['<p>Before.</p>'] }, photo, { items: ['<p>After.</p>'] }] }))
    expect(body(story).map((n) => (n.type === 'block' ? (n.fields as { blockType: string }).blockType : n.type))).toEqual(['paragraph', 'mediaBlock', 'paragraph'])
  })
  it('bare strings at the top of the body count as text too', () => {
    expect(body(ok(page({ articleBody: ['<p>Bare.</p>'] })).story)).toHaveLength(1)
  })
  it('an empty body still gives the editor one empty paragraph to hold', () => {
    expect(body(ok(page({ articleBody: [] })).story)).toHaveLength(1)
  })
})

describe('featured media and audio', () => {
  it('Grove\'s lead photo and audio player become the story\'s featured media and featured audio', () => {
    const r = ok(page({
      lead: [{ _template: '/core/figure/Figure.hbs', alt: 'A', credit: 'Tony Giberson', image: { src: 'https://npr.brightspotcdn.com/lead.jpg' } }],
      audio: [{ _template: '/core/audio/HTML5AudioPlayer.hbs', duration: '4:12', id: 'x', sources: [{ src: 'https://cpa.ds.npr.org/wuwf/audio/rubio.mp3' }] }],
    }))
    expect(r.story.featuredMedia).toHaveLength(1)
    expect(r.story.featuredMedia[0]).toMatchObject({ blockType: 'mediaBlock', credit: 'Tony Giberson' })
    expect(r.story.featuredAudio).toEqual({ $asset: 'https://cpa.ds.npr.org/wuwf/audio/rubio.mp3' })
    expect(r.story.assets.find((a) => a.kind === 'audio')).toMatchObject({ durationSeconds: 252, title: 'Rubio Rallies in Pensacola' })
  })
  it('lists each file once even when the story uses it twice', () => {
    const photo = { _template: '/core/figure/Figure.hbs', image: { src: 'https://npr.brightspotcdn.com/same.jpg' } }
    const r = ok(page({ lead: [photo], articleBody: [{ _template: '/core/enhancement/Enhancement.hbs', item: [photo] }] }))
    expect(r.story.assets.map((a) => a.sourceUrl)).toEqual(['https://npr.brightspotcdn.com/same.jpg'])
  })
})

describe('what is not ours, and what stops a story', () => {
  it('does not convert an NPR or wire story: it is re-pulled from NPR, not migrated as ours', () => {
    const r = convertStory(page({ canonicalLink: 'https://www.npr.org/2016/03/13/a-story', sourceOrganizationName: 'NPR' }))
    expect(r).toMatchObject({ status: 'skipped', reason: 'external' })
  })
  it('does not convert a WUWF-hosted copy of someone else\'s story without a person deciding', () => {
    const r = convertStory(page({ sourceOrganizationName: 'Fresh Air' }))
    expect(r).toMatchObject({ status: 'skipped', reason: 'ambiguous' })
  })
  it('does not treat another kind of page as an article', () => {
    expect(convertStory(page({ _template: '/core/page/ContentPage.hbs' }))).toMatchObject({ status: 'skipped', reason: 'not-an-article' })
    expect(convertStory(null)).toMatchObject({ status: 'skipped', reason: 'not-an-article' })
  })
  it('a story with corrections is an exception: there is nowhere to put them yet', () => {
    const r = ok(page({ updatesCorrections: [{ _template: '/x', body: 'Corrected' }] }))
    expect(r.report.status).toBe('exception')
  })
  it('a story with something to review says so, and a plain one is clean', () => {
    expect(ok(page()).report.status).toBe('clean')
    expect(ok(page({ articleBody: [{ items: ['<p>x</p><script src="https://a.example/x.js"></script>'] }] })).report.status).toBe('review')
  })
})

describe('the output', () => {
  const rich = () => page({
    articleBody: [
      { items: ['<p>One <b>bold</b> <a href="https://www.wuwf.org/x">link</a>.</p><ul><li>a</li></ul>'] },
      { _template: '/core/enhancement/Enhancement.hbs', enhancementAlignment: 'align-left', item: [{ _template: '/core/figure/Figure.hbs', image: { src: 'https://npr.brightspotcdn.com/p.jpg' } }] },
      { _template: '/core/enhancement/Enhancement.hbs', item: [{ _template: '/twitter/TweetUrl.hbs', postUrl: 'https://twitter.com/WUWF/status/1285659380751499264', oEmbed: '<blockquote><p>Hi</p></blockquote>' }] },
    ],
  })
  it('is the same every time it is converted, so a re-run changes nothing', () => {
    expect(JSON.stringify(ok(rich()).story)).toBe(JSON.stringify(ok(rich()).story))
  })
  it('uses only nodes the editor knows and blocks a story body allows', () => {
    expect(lexicalProblems(ok(rich()).story.content)).toEqual([])
  })
  it('every block id is 24 characters and unique within the story', () => {
    const ids: string[] = []
    const walk = (n: { children?: unknown[]; fields?: { id?: string } }) => {
      if (n.fields?.id) ids.push(n.fields.id)
      for (const c of (n.children ?? []) as (typeof n)[]) walk(c)
    }
    walk(ok(rich()).story.content.root)
    expect(ids.length).toBeGreaterThan(1)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((i) => /^[0-9a-f]{24}$/.test(i))).toBe(true)
  })
  it('leaves no raw HTML, script or javascript address anywhere in the converted story', () => {
    const json = JSON.stringify(ok(page({ articleBody: [{ items: ['<p onclick="alert(1)">x<script>alert(1)</script><a href="javascript:alert(1)">y</a></p>'] }] })).story)
    expect(json).not.toMatch(/<script|onclick|javascript:/i)
  })
})
