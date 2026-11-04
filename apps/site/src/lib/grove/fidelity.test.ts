import { describe, expect, it } from 'vitest'

import { compareFidelity, htmlText, sourceFactsOf, squash } from './fidelity'
import { convertStory } from './story'
import * as lex from './lexical'
import type { ConvertedStory, JsonObject } from './types'

const link = (body: string, href: string): JsonObject => ({ _template: '/core/enhancement/InlineEnhancement.hbs', items: [{ _template: '/core/link/Link.hbs', body, href }] })
const article = (extra: JsonObject = {}): JsonObject => ({
  _template: '/core/article/ArticlePage.hbs',
  canonicalLink: 'https://www.wuwf.org/local-news/2024-05-01/stormwater',
  contentId: 'c-1',
  sourceOrganizationName: 'WUWF',
  headline: 'Pensacola votes on a stormwater fee',
  description: 'The vote.',
  datePublishedISO: '2024-05-01T15:00:00Z',
  dateModifiedISO: '2024-05-02T09:00:00Z',
  authorName: 'A Reporter',
  primarySection: [],
  tags: [],
  articleBody: [
    { items: ['<p>The Escambia County commission voted Tuesday night to approve a new stormwater fee for homeowners.</p>', '<p>Residents had asked for a delay of one year, but ', link('the county', 'https://www.wuwf.org/local-news/2024-04-01/county'), ' said the work could not wait.</p>'] },
  ],
  lead: [], audio: [], ...extra,
})
const convert = (page: JsonObject): ConvertedStory => {
  const r = convertStory(page, { embedHosts: [] })
  if (r.status !== 'converted') throw new Error('expected converted')
  return r.story
}
const check = (page: JsonObject, story = convert(page)) => compareFidelity(sourceFactsOf(page), story)
const emptied = (s: ConvertedStory): ConvertedStory => ({ ...s, content: lex.root([lex.paragraph([])]) })

describe('reading a Grove page without the converter', () => {
  it('turns HTML into the text a reader reads, entities decoded, typed tags and scripts gone', () => {
    expect(htmlText('<p>Tom &amp; Jerry&nbsp;said &lt;i&gt;hello&lt;/i&gt;</p><script>var x = "nope"</script><p>Next</p>')).toBe('Tom & Jerry said hello\n Next\n')
    expect(htmlText("{{html('<p>It\\'s fine</p>')}}")).toBe("It's fine\n")
    expect(squash('A, b-C 1!')).toBe('abc1')
  })
  it('finds the body under `articleBody` for an article and under `body` for an episode, with a link read inline', () => {
    const facts = sourceFactsOf(article())
    expect(facts.text).toContain('Residents had asked for a delay of one year, but the county said the work could not wait.')
    expect(sourceFactsOf({ _template: '/media/episode/audio/RadioShowEpisodePage.hbs', body: [{ items: ['<p>Idaho born, Boston bred, and still on the road.</p>'] }] }).text).toContain('Idaho born')
  })
})

describe('the shape real Grove bodies have: a chunk, an inline link, a chunk', () => {
  const page = article({ articleBody: [
    { items: ['<p>Residents said the pavilion next to the Boys &amp; Girls Club was, in the words of the director of the '] },
    { _template: '/core/enhancement/InlineEnhancement.hbs', items: [{ _template: '/core/link/Link.hbs', body: 'Boys &amp; Girls Club of the Emerald Coast', href: 'https://emeraldcoastbgc.org/' }] },
    { items: [' Pensacola club, a great place for the kids to play all summer long.</p>'] },
  ] })
  it('reads the sentence as one paragraph across the chunks and the link, so a story that kept it passes', () => {
    expect(sourceFactsOf(page).text.split('\n').filter((l) => l.trim()).length).toBe(1)
    expect(check(page).level).toBe('pass')
  })
  it('still FAILS a story that dropped the words after the link', () => {
    const story = convert(page)
    const clipped = { ...story, content: lex.root([lex.paragraph([lex.text('Residents said the pavilion next to the Boys & Girls Club was, in the words of the director of the Boys & Girls Club of the Emerald Coast')])]) }
    expect(check(page, clipped).problems.map((p) => p.code)).toContain('body.paragraph-missing')
  })
})

describe('what it does not blame the converter for', () => {
  it('counts a video file in an audio-style player as kept when the story kept the video', () => {
    const page = article({ audio: [{ _template: '/core/audio/HTML5AudioPlayer.hbs', id: 'a1', sources: [{ src: 'https://npr.brightspotcdn.com/aa/clip.mp4', type: 'video/mp4' }] }] })
    const story = convert(page)
    expect(check(page, { ...story, assets: [{ kind: 'video', sourceUrl: 'https://npr.brightspotcdn.com/aa/clip.mp4' }] }).problems.map((p) => p.code)).not.toContain('audio.missing')
  })
  it('warns, not fails, about text that is corrupted JSON in Grove\'s own data', () => {
    const page = article({ articleBody: [{ items: ['<p>Real words that are in the story and long enough to count here.</p>', '<p>https://youtu.be/AB12","_id":"00000179-90c4-d7bf-affb-f8cd32280000","_type":"035d81d3-5be2-3ed2-bc8a-6da208e0d9e2"}">https://youtu.be/AB12</p>'] }] })
    const r = check(page, convert(article({ articleBody: [{ items: ['<p>Real words that are in the story and long enough to count here.</p>'] }] })))
    expect(r.problems.map((p) => p.code)).toContain('source.polluted-text')
    expect(r.problems.map((p) => p.code)).not.toContain('body.paragraph-missing')
  })
  it('does not call a schemeless link host (www.example.org) a lost link', () => {
    const page = article({ articleBody: [{ items: ['<p>See <a href="www.example.org/data">the data</a> for the full set of numbers behind this report today.</p>'] }] })
    expect(check(page).problems.map((p) => p.code)).not.toContain('links.not-found')
  })
})

describe('a <noscript> fallback that spans chunks', () => {
  it('is not text the story must keep: the converter removes it and keeps the embed beside it', () => {
    const page = article({ articleBody: [
      { items: ['<p>In the meantime, experience the whole weekend through the eyes of those who were there.</p>'] },
      { _template: '/core/enhancement/Enhancement.hbs', item: [{ _template: '/core/module/ModuleType.hbs', content: [{ _template: '/module/IframeModule.hbs', height: 750, url: '//storify.com/someone/weekend/embed' }] }] },
      { items: ['<p></p><noscript>['] },
      { _template: '/core/enhancement/InlineEnhancement.hbs', items: [{ _template: '/core/link/Link.hbs', body: 'View the story "Weekend As Told By Attendees" on Storify', href: '//storify.com/someone/weekend' }] },
      { items: [']</noscript><p></p>'] },
    ] })
    const facts = sourceFactsOf(page)
    expect(facts.text).not.toContain('View the story')
    expect(facts.hrefs).toEqual([])
    expect(check(page).problems.map((p) => p.code)).not.toContain('body.paragraph-missing')
  })
})

describe('comparing a story with its page', () => {
  it('passes a story that holds everything its page held', () => {
    const r = check(article())
    expect(r.problems).toEqual([])
    expect(r.level).toBe('pass')
  })
  it('FAILS a story whose body came out empty, the way every episode did when the converter read the wrong field', () => {
    const r = check(article(), emptied(convert(article())))
    expect(r.level).toBe('fail')
    expect(r.problems.map((p) => p.code)).toContain('body.empty')
  })
  it('FAILS a story that lost one paragraph, and names it', () => {
    const page = article()
    const story = convert(page)
    const kept = { ...story, content: lex.root([story.content.root.children[0]!]) } // the second paragraph is gone
    const r = check(page, kept)
    expect(r.level).toBe('fail')
    expect(r.problems.find((p) => p.code === 'body.paragraph-missing')?.detail).toContain('Residents had asked')
  })
  it('FAILS a story that lost half a paragraph, which a word count alone would let through', () => {
    const page = article()
    const story = convert(page)
    const second = story.content.root.children[1]! as unknown as { children: unknown[] }
    const clipped = { ...second, children: [{ ...(second.children[0] as object), text: 'Residents had asked for a delay of one year, but ' }] }
    const r = check(page, { ...story, content: lex.root([story.content.root.children[0]!, clipped as never]) })
    expect(r.problems.map((p) => p.code)).toContain('body.paragraph-missing')
  })
  it('does not mind formatting, typed markup, entities or a "Support Local Stories" line becoming a link line', () => {
    const page = article({ articleBody: [{ items: ['<p>Intro with enough words to count as a real paragraph here.</p>', '<p>Support Local Stories. <a href="/thanks-for-your-support">Donate Here.</a></p>', '<p>A line with &lt;i&gt;Typed Title&lt;/i&gt; in it, and more words after.</p>'] }] })
    expect(check(page).level).toBe('pass')
  })
  it('FAILS a story whose identity changed: path, Grove id, title or publish date', () => {
    const story = convert(article())
    for (const [patch, code] of [
      [{ path: '/local-news/2024-05-01/other' }, 'identity.path'],
      [{ legacy: { ...story.legacy, groveId: 'c-2' } }, 'identity.grove-id'],
      [{ title: 'A different headline' }, 'identity.title'],
      [{ publishedAt: '2024-05-02T15:00:00Z' }, 'identity.published-at'],
    ] as const) expect(compareFidelity(sourceFactsOf(article()), { ...story, ...patch } as ConvertedStory).problems.map((p) => p.code)).toContain(code)
  })
  it('FAILS a story that lost a picture or an audio file, and passes one that kept them', () => {
    const page = article({
      lead: [{ _template: '/core/figure/Figure.hbs', image: { src: 'https://npr.brightspotcdn.com/aa/lead.jpg', width: '800', height: '600' }, alt: 'x', caption: '', credit: '' }],
      audio: [{ _template: '/core/audio/HTML5AudioPlayer.hbs', id: 'a1', sources: [{ src: 'https://cpa.ds.npr.org/s/talk.mp3', type: 'audio/mpeg' }] }],
    })
    const story = convert(page)
    expect(check(page, story).problems).toEqual([])
    const noFiles = { ...story, assets: [] }
    expect(check(page, noFiles).problems.map((p) => p.code)).toEqual(expect.arrayContaining(['image.missing', 'audio.missing']))
  })
  it('only warns about a link the story does not carry', () => {
    const page = article()
    const story = convert(page)
    const stripped = { ...story, content: lex.root([story.content.root.children[0]!, lex.paragraph([lex.text('Residents had asked for a delay of one year, but the county said the work could not wait.')])]) }
    const r = check(page, stripped)
    expect(r.level).toBe('warn')
    expect(r.problems.map((p) => p.code)).toEqual(['links.not-found'])
  })
  it('reads an episode\'s text from `body`: the converter, which now reads it too, passes; one that read the wrong field would fail', () => {
    const page: JsonObject = {
      _template: '/media/episode/audio/RadioShowEpisodePage.hbs', canonicalLink: 'https://www.wuwf.org/show/acoustic-interlude/2026-10-03/josh-ritter', contentId: 'e-1',
      headline: 'Josh Ritter', description: 'x', datePublishedISO: '2026-10-04T05:01:00Z', radioShowTitle: 'Acoustic Interlude', radioShowUrl: 'https://www.wuwf.org/show/acoustic-interlude',
      body: [{ items: ['<p>Idaho born, Boston bred, and a songwriter who never stopped touring the country.</p>'] }], audio: [], lead: [], nprShow: false,
    }
    expect(check(page).level).toBe('pass')
    expect(check(page, emptied(convert(page))).problems.map((p) => p.code)).toContain('body.empty')
  })
})
