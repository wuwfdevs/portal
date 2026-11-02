import { describe, expect, it } from 'vitest'

import { Ctx } from './context'
import { htmlToNodes } from './html'
import { FORMAT } from './lexical'
import type { LexNode } from './types'

const run = (html: string, hosts: string[] = []) => {
  const ctx = new Ctx('seed', hosts)
  return { nodes: htmlToNodes(html, ctx), ctx }
}
const texts = (n: LexNode): string =>
  n.type === 'text' ? String(n.text) : n.type === 'linebreak' ? '\n' : ((n.children as LexNode[] | undefined) ?? []).map(texts).join('')
const codes = (ctx: Ctx) => ctx.entries.map((e) => e.code)

describe('paragraphs and whitespace', () => {
  it('keeps the text and order of each paragraph', () => {
    const { nodes } = run('<p>First.</p><p>Second.</p>')
    expect(nodes.map(texts)).toEqual(['First.', 'Second.'])
    expect(nodes.every((n) => n.type === 'paragraph')).toBe(true)
  })
  it('drops the empty and space-only paragraphs Grove is full of, without a word', () => {
    const { nodes, ctx } = run('<p></p><p>&nbsp;</p><p> </p><p><br></p><p>Real.</p><p></p>')
    expect(nodes.map(texts)).toEqual(['Real.'])
    expect(ctx.entries).toEqual([])
  })
  it('collapses newlines and runs of spaces inside a paragraph, and trims the ends', () => {
    expect(run('<p>  one\n   two   three  </p>').nodes.map(texts)).toEqual(['one two three'])
  })
  it('turns a line break into a line break and drops one at the edge', () => {
    const { nodes } = run('<p><br>Line one<br>Line two<br></p>')
    expect(nodes.map(texts)).toEqual(['Line one\nLine two'])
  })
  it('keeps text that sits outside any paragraph', () => {
    expect(run('Loose text<p>Then a paragraph.</p>').nodes.map(texts)).toEqual(['Loose text', 'Then a paragraph.'])
  })
})

describe('formatting', () => {
  it('maps bold, italic, underline, strikethrough and superscript to the editor\'s format bits', () => {
    const p = run('<p><b>b</b><i>i</i><u>u</u><strike>s</strike><sup>2</sup></p>').nodes[0]!
    expect((p.children as LexNode[]).map((c) => c.format)).toEqual([FORMAT.bold, FORMAT.italic, FORMAT.underline, FORMAT.strikethrough, FORMAT.superscript])
  })
  it('combines formats when tags nest', () => {
    const p = run('<p><b><i>both</i></b></p>').nodes[0]!
    expect((p.children as LexNode[])[0]!.format).toBe(FORMAT.bold | FORMAT.italic)
  })
  it('keeps the text of a tag it does not know, and says which tag it unwrapped', () => {
    const { nodes, ctx } = run('<p>Keep <blink>this</blink> text.</p>')
    expect(nodes.map(texts)).toEqual(['Keep this text.'])
    expect(ctx.entries).toEqual([{ level: 'noted', code: 'html.unwrapped-tag', detail: 'blink' }])
  })
  it('keeps the text of a font tag and notes that its colour and size were dropped', () => {
    const { nodes, ctx } = run('<p><font size="+2" color="red">Big</font></p>')
    expect(nodes.map(texts)).toEqual(['Big'])
    expect(codes(ctx)).toEqual(['html.font-formatting-dropped'])
  })
  it('centres a paragraph that Grove centred, by class or by a centre tag', () => {
    expect(run('<p class="cms-textAlign-center">x</p>').nodes[0]!.format).toBe('center')
    expect(run('<center><p>y</p></center>').nodes[0]!.format).toBe('center')
  })
})

describe('links', () => {
  const link = (html: string) => {
    const { nodes, ctx } = run(html)
    const l = (nodes[0]!.children as LexNode[]).find((c) => c.type === 'link')
    return { l, ctx, fields: l?.fields as { url: string; newTab: boolean; linkType: string } | undefined }
  }
  it('keeps an outside link and whether it opens in a new tab', () => {
    const { fields } = link('<p><a href="https://example.org/a?b=1" target="_blank">x</a></p>')
    expect(fields).toEqual({ linkType: 'custom', url: 'https://example.org/a?b=1', newTab: true })
  })
  it('makes a link to our own site relative, so it keeps working whatever the domain', () => {
    expect(link('<p><a href="https://www.wuwf.org/local-news/2020-01-02/a-story">x</a></p>').fields?.url).toBe('/local-news/2020-01-02/a-story')
    expect(link('<p><a href="http://wuwf.org/people/jane-doe?x=1#top">x</a></p>').fields?.url).toBe('/people/jane-doe?x=1#top')
  })
  it('adds https to an address that has none', () => {
    expect(link('<p><a href="www.countyhealthrankings.org/florida">x</a></p>').fields?.url).toBe('https://www.countyhealthrankings.org/florida')
  })
  it('refuses a javascript address, keeps the words, and flags it for review', () => {
    const { nodes, ctx } = run('<p>See <a href="javascript:alert(1)">this</a> now.</p>')
    expect(nodes.map(texts)).toEqual(['See this now.'])
    expect(JSON.stringify(nodes)).not.toContain('javascript')
    expect(ctx.entries).toEqual([{ level: 'preserved', code: 'link.unsafe-address-removed', detail: 'javascript:' }])
  })
  it('links the visible text when the address is unusable but the text is an address', () => {
    const { fields, ctx } = link('<p><a href="<garbage">https://example.org/page</a></p>')
    expect(fields?.url).toBe('https://example.org/page')
    expect(codes(ctx)).toContain('link.address-taken-from-text')
  })
  it('a mailto link survives', () => {
    expect(link('<p><a href="mailto:news@wuwf.org">mail</a></p>').fields?.url).toBe('mailto:news@wuwf.org')
  })
})

describe('headings, lists and quotes', () => {
  it('maps headings, and demotes a stray h1 because the page title is the h1', () => {
    const { nodes, ctx } = run('<h3>Section</h3><h1>Big</h1>')
    expect(nodes.map((n) => [n.type, n.tag])).toEqual([['heading', 'h3'], ['heading', 'h2']])
    expect(codes(ctx)).toEqual(['heading.h1-became-h2'])
  })
  it('maps bullet and numbered lists, with nesting', () => {
    const { nodes } = run('<ul><li>One</li><li>Two<ul><li>Inner</li></ul></li></ul><ol><li>First</li></ol>')
    expect(nodes[0]).toMatchObject({ type: 'list', listType: 'bullet' })
    expect((nodes[0]!.children as LexNode[]).map((c) => texts(c))).toEqual(['One', 'Two', 'Inner'])
    expect(nodes[1]).toMatchObject({ type: 'list', listType: 'number' })
  })
  it('turns a blockquote into one quote, a paragraph per line', () => {
    const { nodes } = run('<blockquote><p>Line one.</p><p>Line two.</p></blockquote>')
    expect(nodes[0]).toMatchObject({ type: 'quote' })
    expect(texts(nodes[0]!)).toBe('Line one.\nLine two.')
  })
  it('keeps a horizontal rule', () => {
    expect(run('<p>a</p><hr><p>b</p>').nodes.map((n) => n.type)).toEqual(['paragraph', 'horizontalrule', 'paragraph'])
  })
})

describe('what must never be imported, or lost without being said', () => {
  it('removes a script, keeps the page around it, and flags the story for review', () => {
    const { nodes, ctx } = run('<p>Before.</p><script async src="https://platform.twitter.com/widgets.js"></script><p>After.</p>')
    expect(nodes.map(texts)).toEqual(['Before.', 'After.'])
    expect(JSON.stringify(nodes)).not.toContain('widgets.js')
    expect(ctx.entries).toEqual([{ level: 'preserved', code: 'html.script-removed', detail: 'platform.twitter.com' }])
  })
  it('keeps a table as preserved HTML (the one thing the editor cannot hold) and flags it', () => {
    const { nodes, ctx } = run('<table><tbody><tr><td>Mon</td><td>9am</td></tr></tbody></table>')
    expect(nodes[0]).toMatchObject({ type: 'block', fields: { blockType: 'legacyHtml', note: 'Table from Grove' } })
    expect((nodes[0]!.fields as { html: string }).html).toContain('<td>Mon</td>')
    expect(codes(ctx)).toEqual(['html.table-preserved'])
  })
  it('notes a noscript and drops it', () => {
    const { nodes, ctx } = run('<p>a</p><noscript>fallback</noscript>')
    expect(nodes.map(texts)).toEqual(['a'])
    expect(codes(ctx)).toEqual(['html.noscript-removed'])
  })
})

describe('pictures and frames inside text', () => {
  it('turns an image into a media block with an asset token, splitting the paragraph around it', () => {
    const { nodes, ctx } = run('<p>Before <img src="//www.wuwf.org/sites/wuwf/files/a.jpg" alt="A cat" width="300"> after.</p>')
    expect(nodes.map((n) => n.type)).toEqual(['paragraph', 'block', 'paragraph'])
    expect(nodes[1]!.fields).toMatchObject({ blockType: 'mediaBlock', media: { $asset: 'https://www.wuwf.org/sites/wuwf/files/a.jpg' }, altText: 'A cat' })
    expect([...ctx.assets.values()]).toEqual([{ kind: 'image', sourceUrl: 'https://www.wuwf.org/sites/wuwf/files/a.jpg', alt: 'A cat', width: 300 }])
  })
  it('an image with no usable address is flagged, not silently skipped', () => {
    const { nodes, ctx } = run('<p>x<img src="resource://skype/ext"></p>')
    expect(nodes.map(texts)).toEqual(['x'])
    expect(codes(ctx)).toEqual(['image.no-address'])
  })
  it('a YouTube frame becomes an embed block', () => {
    const { nodes } = run('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="A video"></iframe>')
    expect(nodes[0]!.fields).toMatchObject({ blockType: 'embed', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', title: 'A video' })
  })
  it('a frame from a host nobody approved becomes a link, never nothing, and names the host to approve', () => {
    const { nodes, ctx } = run('<iframe src="https://embed.documentcloud.org/documents/1/?embed=1" width="600" height="400"></iframe>')
    expect(nodes[0]!.type).toBe('paragraph')
    expect(JSON.stringify(nodes[0])).toContain('https://embed.documentcloud.org/documents/1/?embed=1')
    expect(ctx.entries).toEqual([{ level: 'preserved', code: 'embed.host-not-approved', detail: 'embed.documentcloud.org' }])
  })
  it('the same frame becomes an embed once its host is approved, keeping its proportions', () => {
    const { nodes, ctx } = run('<iframe src="https://embed.documentcloud.org/documents/1/" width="600" height="400"></iframe>', ['embed.documentcloud.org'])
    expect(nodes[0]!.fields).toMatchObject({ blockType: 'embed', width: 600, height: 400 })
    expect(ctx.entries).toEqual([])
  })
  it('an embedded tweet becomes a link-only X embed carrying the tweet\'s text, and its script is reported', () => {
    const { nodes, ctx } = run(
      '<blockquote class="twitter-tweet"><p lang="en">Storm update: roads are closed.</p>&mdash; WUWF (@WUWF) <a href="https://twitter.com/WUWF/status/1285659380751499264?ref_src=twsrc%5Etfw">July 21</a></blockquote><script async src="https://platform.twitter.com/widgets.js"></script>',
    )
    expect(nodes[0]!.fields).toMatchObject({ blockType: 'embed', url: 'https://twitter.com/WUWF/status/1285659380751499264?ref_src=twsrc%5Etfw', caption: 'Storm update: roads are closed.' })
    expect(codes(ctx)).toEqual(['html.script-removed'])
  })
})
