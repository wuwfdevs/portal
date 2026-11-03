import { describe, expect, it } from 'vitest'

import { Ctx } from './context'
import { enhancementNodes, leadItems } from './enhancements'
import type { Json, JsonObject, LexNode } from './types'

const T = (name: string) => `/core/${name}.hbs`
const fig = (extra: JsonObject = {}): JsonObject => ({
  _template: T('figure/Figure'), alt: 'Alt text', caption: 'A caption', credit: 'Jane Doe / WUWF', source: 'WUWF archive',
  image: { src: 'https://npr.brightspotcdn.com/aa/bb/photo.jpg', width: '1280', height: '853' }, ...extra,
})
const enh = (item: JsonObject, alignment?: string): JsonObject => ({ _template: T('enhancement/Enhancement'), item: [item], ...(alignment ? { enhancementAlignment: alignment } : {}) })
const run = (e: JsonObject, hosts: string[] = []) => {
  const ctx = new Ctx('seed', hosts)
  return { nodes: enhancementNodes(e, ctx), ctx }
}
const fields = (n: LexNode | undefined) => n?.fields as Record<string, unknown>

describe('a photo (Figure)', () => {
  it('becomes a media block carrying its caption, credit, source and alt text, and registers the file', () => {
    const { nodes, ctx } = run(enh(fig()))
    expect(fields(nodes[0])).toMatchObject({
      blockType: 'mediaBlock', media: { $asset: 'https://npr.brightspotcdn.com/aa/bb/photo.jpg' },
      caption: 'A caption', credit: 'Jane Doe / WUWF', source: 'WUWF archive', altText: 'Alt text', alignment: 'full',
    })
    expect([...ctx.assets.values()]).toEqual([{ kind: 'image', sourceUrl: 'https://npr.brightspotcdn.com/aa/bb/photo.jpg', width: 1280, height: 853, alt: 'Alt text', credit: 'Jane Doe / WUWF', source: 'WUWF archive' }])
  })
  it('maps Grove\'s alignment names, and says when it meets one it does not know', () => {
    expect(fields(run(enh(fig(), 'align-left')).nodes[0]).alignment).toBe('left')
    expect(fields(run(enh(fig(), 'align-right')).nodes[0]).alignment).toBe('right')
    expect(fields(run(enh(fig(), 'align-center')).nodes[0]).alignment).toBe('center')
    const odd = run(enh(fig(), 'align-diagonal'))
    expect(fields(odd.nodes[0]).alignment).toBe('full')
    expect(odd.ctx.entries).toEqual([{ level: 'noted', code: 'enhancement.unknown-alignment', detail: 'align-diagonal' }])
  })
  it('flattens markup in a caption to plain text and says so', () => {
    const { nodes, ctx } = run(enh(fig({ caption: 'Seen from <i>above</i> &amp; below' })))
    expect(fields(nodes[0]).caption).toBe('Seen from above & below')
    expect(ctx.entries).toEqual([{ level: 'noted', code: 'text.markup-flattened', detail: 'caption' }])
  })
  it('a figure that says something but has no picture is an exception, not a silent skip', () => {
    const { nodes, ctx } = run(enh({ _template: T('figure/Figure'), caption: 'Orphan caption' }))
    expect(nodes).toEqual([])
    expect(ctx.entries).toEqual([{ level: 'exception', code: 'figure.no-image', detail: 'Figure' }])
  })
})

describe('a gallery (Carousel)', () => {
  const slide = (extra: JsonObject = {}): JsonObject => ({
    _template: T('gallery/GallerySlide'), infoAttribution: 'Anthony Potts / WUWF', infoDescription: ' Lumon May ', infoTitle: 'Opening night',
    mediaContent: [{ _template: T('image/Image'), alt: 'Lumon May', image: { src: 'https://npr.brightspotcdn.com/x/slide1.jpg', width: '900', height: '600' } }], ...extra,
  })
  it('becomes a carousel gallery with each slide\'s title, caption and credit', () => {
    const { nodes } = run(enh({ _template: T('carousel/Carousel'), title: 'Opening night', slides: [slide(), slide({ infoTitle: undefined as unknown as Json })] }))
    const f = fields(nodes[0])
    expect(f).toMatchObject({ blockType: 'gallery', layout: 'carousel', title: 'Opening night' })
    expect((f.images as Record<string, unknown>[])[0]).toMatchObject({ title: 'Opening night', caption: 'Lumon May', credit: 'Anthony Potts / WUWF' })
  })
  it('drops a slide title that is only the file name, and notes it', () => {
    const { nodes, ctx } = run(enh({ _template: T('carousel/Carousel'), slides: [slide({ infoTitle: 'P1120671.jpeg' })] }))
    expect((fields(nodes[0]).images as Record<string, unknown>[])[0]).not.toHaveProperty('title')
    expect(ctx.entries.map((e) => e.code)).toEqual(['gallery.filename-title-dropped'])
  })
  it('flags a slide with no picture and fails a gallery with none at all', () => {
    const ok = run(enh({ _template: T('carousel/Carousel'), slides: [slide(), { _template: T('gallery/GallerySlide'), mediaContent: [] }] }))
    expect(ok.ctx.entries.map((e) => e.code)).toEqual(['gallery.slide-without-picture'])
    const none = run(enh({ _template: T('carousel/Carousel'), slides: [{ _template: T('gallery/GallerySlide'), mediaContent: [] }] }))
    expect(none.nodes).toEqual([])
    expect(none.ctx.entries.map((e) => e.level)).toEqual(['preserved', 'exception'])
  })
})

describe('audio, quotes and modules', () => {
  const player = { _template: T('audio/HTML5AudioPlayer'), duration: '11:41', id: 'x', sources: [{ src: 'https://cpa.ds.npr.org/wuwf/audio/2015/07/talk.mp3' }] }
  it('an audio enhancement becomes an audio block, with its length and title on the file', () => {
    const { nodes, ctx } = run(enh({ _template: T('audio/AudioEnhancement'), title: 'Full conversation', description: 'The nursing cohort', player: [player] }))
    expect(fields(nodes[0])).toMatchObject({ blockType: 'audioPlayer', audio: { $asset: 'https://cpa.ds.npr.org/wuwf/audio/2015/07/talk.mp3' }, title: 'Full conversation', description: 'The nursing cohort' })
    expect([...ctx.assets.values()][0]).toMatchObject({ kind: 'audio', durationSeconds: 701, mimeType: 'audio/mpeg', title: 'Full conversation' })
  })
  it('prefers the MP3 and says which other formats were left behind', () => {
    const p = { ...player, sources: [{ src: 'https://cpa.ds.npr.org/a/talk.wav', type: 'audio/x-wav' }, { src: 'https://cpa.ds.npr.org/a/talk.mp3', type: 'audio/mpeg' }] }
    const { ctx } = run(enh({ _template: T('audio/AudioEnhancement'), player: [p] }))
    expect([...ctx.assets.keys()]).toEqual(['https://cpa.ds.npr.org/a/talk.mp3'])
    expect(ctx.entries).toEqual([{ level: 'noted', code: 'audio.other-formats-not-kept', detail: 'audio/x-wav' }])
  })
  it('a pull quote becomes a pull-quote block; any other quote stays a quote in the text', () => {
    const pull = run(enh({ _template: T('quote/QuoteEnhancement'), pullQuote: true, quote: 'It is a vote.', attribution: 'A neighbour' }))
    expect(fields(pull.nodes[0])).toMatchObject({ blockType: 'pullQuote', text: 'It is a vote.', attribution: 'A neighbour' })
    const plain = run(enh({ _template: T('quote/QuoteEnhancement'), pullQuote: false, quote: 'To: the board', attribution: 'Faculty Senate' }))
    expect(plain.nodes[0]).toMatchObject({ type: 'quote' })
    expect(JSON.stringify(plain.nodes[0])).toContain('— Faculty Senate')
  })
  it('a Facebook plugin frame becomes a link-only Facebook embed of the post itself', () => {
    const { nodes } = run(enh({ _template: T('module/ModuleType'), content: [{ _template: '/module/IframeModule.hbs', width: 500, height: 726, url: '//www.facebook.com/plugins/post.php?href=https%3A%2F%2Fwww.facebook.com%2FOkaloosaCounty%2Fposts%2F2779920965577382&width=500' }] }))
    expect(fields(nodes[0])).toMatchObject({ blockType: 'embed', url: 'https://www.facebook.com/OkaloosaCounty/posts/2779920965577382', title: 'View the post on Facebook' })
  })
  it('a tweet becomes a link-only X embed carrying the tweet text', () => {
    const { nodes } = run(enh({ _template: '/twitter/TweetUrl.hbs', postId: '1', postUrl: 'https://twitter.com/WUWF/status/1285659380751499264?ref_src=twsrc%5Etfw', oEmbed: '<blockquote class="twitter-tweet"><p lang="en">Cases are rising.</p>&mdash; WUWF</blockquote>' }))
    expect(fields(nodes[0])).toMatchObject({ blockType: 'embed', title: 'View the post on X', caption: 'Cases are rising.' })
  })
  it('a YouTube link takes its title from the oEmbed frame', () => {
    const { nodes } = run(enh({ _template: '/youtube/YouTubeUrl.hbs', postUrl: 'https://youtu.be/dQw4w9WgXcQ?si=abc', oEmbed: '<iframe width="200" title="Chappie James at 100" src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>' }))
    expect(fields(nodes[0])).toMatchObject({ blockType: 'embed', title: 'Chappie James at 100' })
  })
  it('a Pym interactive hands its HTML to the converter, so its frame becomes an embed or a flagged link', () => {
    const e = enh({ _template: '/pyminteractive/PymInteractive.hbs', html: '<iframe src="https://www.npr.org/player/embed/1/2" width="100%" height="290"></iframe>' })
    // npr.org is on the built-in list, so it loads without a click and nothing is flagged
    expect(run(e).ctx.entries).toEqual([])
    expect(fields(run(e).nodes[0])).toMatchObject({ blockType: 'embed', height: 290 })
    const other = enh({ _template: '/pyminteractive/PymInteractive.hbs', html: '<iframe src="https://maps.example.org/x" height="290"></iframe>' })
    expect(run(other).ctx.entries).toEqual([{ level: 'noted', code: 'embed.click-to-load', detail: 'maps.example.org' }])
    expect(fields(run(other).nodes[0])).toMatchObject({ blockType: 'embed' })
  })
})

describe('video', () => {
  const v = (player: JsonObject, extra: JsonObject = {}): JsonObject => ({ _template: T('video/VideoEnhancement'), title: 'The Planets', caption: 'A performance', player: [player], ...extra })
  it('a YouTube or Vimeo player becomes an embed', () => {
    expect(fields(run(enh(v({ _template: '/youtube/YouTubeVideoPlayer.hbs', videoId: 'dQw4w9WgXcQ' }))).nodes[0])).toMatchObject({ blockType: 'embed', title: 'The Planets', caption: 'A performance' })
    expect(fields(run(enh(v({ _template: '/vimeo/VimeoVideoPlayer.hbs', videoId: '1008776089' }))).nodes[0]).url).toBe('https://vimeo.com/1008776089')
  })
  it('a video file becomes a video block with its poster picture, both registered as files to copy', () => {
    const { nodes, ctx } = run(enh(v({ _template: T('video/HTML5VideoPlayer'), poster: { src: 'https://npr.brightspotcdn.com/x/poster.jpg' }, sources: [{ _template: T('video/HTML5VideoPlayerSource'), src: 'https://npr.brightspotcdn.com/b8/planets.mp4', type: 'video/mp4' }] })))
    expect(fields(nodes[0])).toMatchObject({
      blockType: 'videoPlayer', video: { $asset: 'https://npr.brightspotcdn.com/b8/planets.mp4' }, title: 'The Planets', caption: 'A performance',
      poster: { $asset: 'https://npr.brightspotcdn.com/x/poster.jpg' },
    })
    expect([...ctx.assets.values()].map((a) => [a.kind, a.sourceUrl])).toEqual([['image', 'https://npr.brightspotcdn.com/x/poster.jpg'], ['video', 'https://npr.brightspotcdn.com/b8/planets.mp4']])
    expect(ctx.entries).toEqual([])
  })
  it('prefers the MP4 and says which other formats were left behind', () => {
    const { ctx } = run(enh(v({ _template: T('video/HTML5VideoPlayer'), sources: [{ src: 'https://x/a.webm', type: 'video/webm' }, { src: 'https://x/a.mp4', type: 'video/mp4' }] })))
    expect([...ctx.assets.keys()]).toEqual(['https://x/a.mp4'])
    expect(ctx.entries).toEqual([{ level: 'noted', code: 'video.other-formats-not-kept', detail: 'video/webm' }])
  })
  it('a video player with no file is an exception, not a silent skip', () => {
    const { nodes, ctx } = run(enh(v({ _template: T('video/HTML5VideoPlayer'), sources: [] })))
    expect(nodes).toEqual([])
    expect(ctx.entries).toEqual([{ level: 'exception', code: 'video.no-source' }])
  })
})

describe('anything unknown stops the story, loudly', () => {
  it('an unknown template inside an enhancement is an exception naming it', () => {
    const { nodes, ctx } = run(enh({ _template: '/mystery/NewThing.hbs' }))
    expect(nodes).toEqual([])
    expect(ctx.entries).toEqual([{ level: 'exception', code: 'enhancement.unknown-template', detail: '/mystery/NewThing.hbs' }])
  })
})

describe('the featured media (Grove\'s lead)', () => {
  it('a lead photo becomes one featured media block', () => {
    const ctx = new Ctx('seed')
    const items = leadItems([fig({ _styledTemplate: '/core/figure/LeadFigure.hbs' })], ctx)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ blockType: 'mediaBlock', alignment: 'full', caption: 'A caption' })
    expect(items[0]!.id).toHaveLength(24)
  })
  it('a lead gallery becomes a featured gallery', () => {
    const ctx = new Ctx('seed')
    const items = leadItems([{ _template: T('carousel/Carousel'), slides: [{ _template: T('gallery/GallerySlide'), mediaContent: [{ _template: T('image/Image'), image: { src: 'https://npr.brightspotcdn.com/x/a.jpg' } }] }] }], ctx)
    expect(items[0]).toMatchObject({ blockType: 'gallery', layout: 'carousel' })
  })
  it('an empty lead figure is just "no featured picture", not a problem', () => {
    const ctx = new Ctx('seed')
    expect(leadItems([{ _template: T('figure/Figure'), _styledTemplate: '/core/figure/LeadFigure.hbs' }], ctx)).toEqual([])
    expect(ctx.entries).toEqual([{ level: 'noted', code: 'figure.empty' }])
  })
  it('only one item can open a story; any more are reported, not dropped silently', () => {
    const ctx = new Ctx('seed')
    expect(leadItems([fig(), fig()], ctx)).toHaveLength(1)
    expect(ctx.entries).toEqual([{ level: 'preserved', code: 'lead.extra-items-not-kept', detail: '1' }])
  })
})
