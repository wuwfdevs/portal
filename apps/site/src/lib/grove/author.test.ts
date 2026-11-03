import { describe, expect, it } from 'vitest'

import { convertAuthorPage } from './author'
import type { JsonObject } from './types'

const author = (over: JsonObject = {}): JsonObject => ({
  _template: '/core/author/AuthorPage.hbs',
  canonicalLink: 'https://www.wuwf.org/people/rachel-cramer',
  contentId: '00000177-b32b-d5f4-a5ff-bbfb139500d0',
  title: 'Rachel Cramer | WUWF',
  name: 'Rachel Cramer',
  description: 'Rachel is a UM grad working in the MTPR news department.',
  fullBiography: [{ items: ['<p>Rachel is a UM grad working in the MTPR news department.</p>'] }],
  authorSocialLinks: [],
  main: [{ _template: '/core/container/Container.hbs', rows: [] }],
  ...over,
})
const ok = (p: JsonObject) => {
  const r = convertAuthorPage(p)
  if (r.status !== 'converted') throw new Error('expected converted')
  return r
}

describe('convertAuthorPage', () => {
  it('keeps the exact address and id, the name and the one-line summary', () => {
    const { author: a } = ok(author())
    expect(a).toMatchObject({
      path: '/people/rachel-cramer',
      slug: 'rachel-cramer',
      name: 'Rachel Cramer',
      summary: 'Rachel is a UM grad working in the MTPR news department.',
      legacy: { groveId: '00000177-b32b-d5f4-a5ff-bbfb139500d0', legacyPath: '/people/rachel-cramer' },
      portrait: null,
      links: [],
    })
    expect(a.biography?.root.children.map((n) => n.type)).toEqual(['paragraph'])
  })

  it('says the story list is rebuilt from bylines instead of carrying it', () => {
    expect(ok(author()).report.entries.map((e) => e.code)).toContain('author.story-list-rebuilt-from-bylines')
  })

  it('reads a biography with an inline link in the middle of a paragraph, as Grove splits it', () => {
    const bio: JsonObject[] = [
      { items: ['<p>Wolf is a contributing editor to "'] },
      { _template: '/core/enhancement/InlineEnhancement.hbs', items: [{ _template: '/core/link/Link.hbs', body: 'Kitchen Window', href: 'http://www.npr.org/x', target: '_blank' }] },
      { items: ['," NPR\'s weekly column.</p><p>A second paragraph.</p>'] },
    ]
    const { author: a } = ok(author({ fullBiography: bio }))
    expect(a.biography?.root.children).toHaveLength(2)
    expect(JSON.stringify(a.biography)).toContain('Kitchen Window')
    expect(JSON.stringify(a.biography)).toContain('http://www.npr.org/x')
  })

  it('turns the portrait into an asset token and lists the file for the pipeline', () => {
    const src = 'https://media.npr.org/documents/about/people/bios/biophotos/bonny_wolf_custom-590d.jpg'
    const { author: a } = ok(author({ image: [{ _template: '/core/image/Image.hbs', alt: '', image: { src }, narrowImage: { src } }] }))
    expect(a.portrait).not.toBeNull()
    expect(a.assets).toContainEqual(expect.objectContaining({ kind: 'image', sourceUrl: src, alt: 'Rachel Cramer' }))
  })

  it('reads links, keeps only http(s) ones, and flags the rest', () => {
    const r = ok(author({ authorSocialLinks: [{ href: 'https://twitter.com/rcramer', body: 'Twitter' }, { href: 'https://example.org/page' }, { href: 'javascript:alert(1)', body: 'Bad' }, { body: 'No address' }] }))
    expect(r.author.links).toEqual([
      { label: 'Twitter', url: 'https://twitter.com/rcramer' },
      { label: 'example.org', url: 'https://example.org/page' },
    ])
    expect(r.report.entries.filter((e) => e.code === 'author.link-not-mapped')).toHaveLength(2)
    expect(r.report.status).toBe('review')
  })

  it('has no biography when Grove has none, and falls back to the title for the name', () => {
    const { author: a } = ok(author({ fullBiography: null, description: null, name: '' }))
    expect(a.biography).toBeNull()
    expect(a.summary).toBeNull()
    expect(a.name).toBe('Rachel Cramer')
  })

  it('refuses a page with no id, address or name', () => {
    for (const bad of [{ contentId: '' }, { canonicalLink: 'https://www.wuwf.org/' }, { name: '', title: '' }] as JsonObject[]) expect(convertAuthorPage(author(bad)).report.status).toBe('exception')
  })

  it('does not convert anything that is not an author page', () => {
    expect(convertAuthorPage({ _template: '/core/article/ArticlePage.hbs' }).status).toBe('skipped')
  })
})
