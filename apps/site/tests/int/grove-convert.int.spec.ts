// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { convertStory, resolveAssets, type AssetRef } from '@/lib/grove'

import { ensureTestSection } from '../helpers/section'

// The converter's output has to be something Payload accepts and keeps: a Grove page goes in, its files become
// library records, the converted story is published through the real collection, and what comes back is the same
// story. (Nothing here fetches anything: the "files" are generated.)

const run = Date.now().toString(36)
let payload: Payload
const made: { collection: 'media' | 'audio' | 'posts'; id: number | string }[] = []

const link = (body: string, href: string) => ({ _template: '/core/link/Link.hbs', body, href, target: '_blank', extraAttributes: '' })
const page = () => ({
  _template: '/core/article/ArticlePage.hbs',
  canonicalLink: `https://www.wuwf.org/local-news/2016-03-13/grove-converter-${run}/`,
  contentId: `00000170-20c3-df2b-ab7b-${run.padEnd(12, '0').slice(0, 12)}`,
  sourceOrganizationName: 'WUWF',
  headline: `Converter check ${run}`,
  description: 'A synthetic page shaped like a real one.',
  datePublishedISO: '2016-03-13T19:39:31Z',
  dateModifiedISO: '2016-03-14T01:03:45Z',
  authorName: 'Dave Dunwoody', authorUrl: 'https://www.wuwf.org/people/dave-dunwoody',
  primarySection: [link('Local News', 'https://www.wuwf.org/local-news')],
  lead: [{ _template: '/core/figure/Figure.hbs', _styledTemplate: '/core/figure/LeadFigure.hbs', alt: 'Lead alt', caption: 'Lead caption', credit: 'Tony Giberson', image: { src: `https://npr.brightspotcdn.com/lead-${run}.jpg`, width: '1200', height: '800' } }],
  audio: [{ _template: '/core/audio/HTML5AudioPlayer.hbs', duration: '4:12', id: 'a', sources: [{ src: `https://cpa.ds.npr.org/wuwf/audio/${run}.wav`, type: 'audio/x-wav' }] }],
  articleBody: [
    { items: ['<p>He spoke <b>Saturday</b> night. See '] },
    { _template: '/core/enhancement/InlineEnhancement.hbs', items: [link('EJYC.org', 'http://EJYC.org')] },
    { items: [' for more.</p><ul><li>One</li><li>Two</li></ul>'] },
    { _template: '/core/enhancement/Enhancement.hbs', enhancementAlignment: 'align-left', item: [{ _template: '/core/figure/Figure.hbs', alt: 'Body alt', caption: 'Body caption', credit: 'Staff', image: { src: `https://npr.brightspotcdn.com/body-${run}.jpg`, width: '900', height: '600' } }] },
    { items: ['<p>Then a table:</p><table><tbody><tr><td>Mon</td><td>9am</td></tr></tbody></table><script src="https://platform.twitter.com/widgets.js"></script>'] },
    { _template: '/core/enhancement/Enhancement.hbs', item: [{ _template: '/twitter/TweetUrl.hbs', postUrl: 'https://twitter.com/WUWF/status/1285659380751499264?ref_src=x', oEmbed: '<blockquote><p>Cases are rising.</p></blockquote>' }] },
    { _template: '/core/enhancement/Enhancement.hbs', item: [{ _template: '/core/quote/QuoteEnhancement.hbs', pullQuote: true, quote: 'It is a vote.', attribution: 'A neighbour' }] },
    { _template: '/core/enhancement/Enhancement.hbs', item: [{ _template: '/core/audio/AudioEnhancement.hbs', title: 'Full interview', player: [{ _template: '/core/audio/HTML5AudioPlayer.hbs', duration: '11:41', sources: [{ src: `https://cpa.ds.npr.org/wuwf/audio/interview-${run}.wav` }] }] }] },
  ],
})

async function store(a: AssetRef): Promise<number | string> {
  if (a.kind === 'image') {
    const data = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } }).png().toBuffer()
    const doc = await payload.create({
      collection: 'media', overrideAccess: true, context: { disableRevalidate: true },
      file: { data, mimetype: 'image/png', name: `${a.sourceUrl.split('/').pop()}.png`, size: data.length },
      data: { alt: a.alt ?? '', ...(a.credit ? { credit: a.credit } : {}), legacy: { sourceUrl: a.sourceUrl } } as never,
    })
    made.push({ collection: 'media', id: doc.id })
    return doc.id
  }
  const samples = 800
  const data = Buffer.alloc(44 + samples, 0x80)
  data.write('RIFF', 0); data.writeUInt32LE(36 + samples, 4); data.write('WAVE', 8); data.write('fmt ', 12); data.writeUInt32LE(16, 16)
  data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(8000, 24); data.writeUInt32LE(8000, 28); data.writeUInt16LE(1, 32); data.writeUInt16LE(8, 34)
  data.write('data', 36); data.writeUInt32LE(samples, 40)
  const doc = await payload.create({
    collection: 'audio', overrideAccess: true,
    file: { data, mimetype: 'audio/wav', name: `${a.sourceUrl.split('/').pop()}`, size: data.length },
    data: { title: a.title ?? 'Audio', ...(a.durationSeconds ? { durationSeconds: a.durationSeconds } : {}), legacy: { sourceUrl: a.sourceUrl } } as never,
  })
  made.push({ collection: 'audio', id: doc.id })
  return doc.id
}

describe('a converted Grove page becomes a story Payload accepts and keeps', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  }, 60_000)
  afterAll(async () => {
    for (const { collection, id } of made.reverse()) await payload.delete({ collection, id, overrideAccess: true, context: { disableRevalidate: true } }).catch(() => undefined)
  })

  it('round-trips through the real collection with its exact path, identity, dates, files and blocks', async () => {
    const r = convertStory(page())
    if (r.status !== 'converted') throw new Error('not converted')
    const { story } = r
    expect(r.report.status).toBe('review') // the script beside the table must be flagged, and nothing else

    // The asset pipeline's job, in miniature: one library record per file, then tokens become ids.
    const ids = new Map<string, number | string>()
    for (const a of story.assets) ids.set(a.sourceUrl, await store(a))
    const resolved = resolveAssets({ content: story.content, featuredMedia: story.featuredMedia, featuredAudio: story.featuredAudio }, ids)

    const post = await payload.create({
      collection: 'posts', overrideAccess: true, context: { disableRevalidate: true },
      data: {
        title: story.title, path: story.path, publishedAt: story.publishedAt, source: story.source, section: await ensureTestSection(payload),
        meta: { description: story.description }, legacy: { legacyPath: story.legacy.legacyPath, groveId: story.legacy.groveId, modifiedAt: story.legacy.modifiedAt },
        content: resolved.content, featuredMedia: resolved.featuredMedia, featuredAudio: resolved.featuredAudio, _status: 'published',
      } as never,
    })
    made.push({ collection: 'posts', id: post.id })

    const back = await payload.findByID({ collection: 'posts', id: post.id, depth: 0, overrideAccess: true })
    // identity and dates are exactly Grove's
    expect(back.path).toBe(`/local-news/2016-03-13/grove-converter-${run}`)
    expect(back.legacy).toMatchObject({ legacyPath: back.path, groveId: story.legacy.groveId })
    expect(back.legacy?.modifiedAt).toBe('2016-03-14T01:03:45.000Z')
    expect(back.publishedAt).toBe('2016-03-13T19:39:31.000Z')
    expect(back.meta?.description).toBe('A synthetic page shaped like a real one.')
    expect(back._status).toBe('published')

    // the featured media and audio point at the library records made for those files
    expect(back.featuredMedia).toHaveLength(1)
    expect(back.featuredMedia?.[0]).toMatchObject({ blockType: 'mediaBlock', media: ids.get(`https://npr.brightspotcdn.com/lead-${run}.jpg`), caption: 'Lead caption', credit: 'Tony Giberson', altText: 'Lead alt' })
    expect(back.featuredAudio).toBe(ids.get(`https://cpa.ds.npr.org/wuwf/audio/${run}.wav`))

    // the body kept its order and every block, with the library ids filled in
    const kinds = (back.content.root.children as { type: string; fields?: { blockType?: string } }[]).map((n) => (n.type === 'block' ? n.fields!.blockType : n.type))
    expect(kinds).toEqual(['paragraph', 'list', 'block' /* the photo */, 'paragraph', 'block' /* the table */, 'block' /* the tweet */, 'block' /* the pull quote */, 'block' /* the audio */].map((k, i) => (k === 'block' ? ['mediaBlock', 'legacyHtml', 'embed', 'pullQuote', 'audioPlayer'][[2, 4, 5, 6, 7].indexOf(i)] : k)))
    const blocks = (back.content.root.children as { type: string; fields?: Record<string, unknown> }[]).filter((n) => n.type === 'block').map((n) => n.fields!)
    expect(blocks[0]).toMatchObject({ blockType: 'mediaBlock', media: ids.get(`https://npr.brightspotcdn.com/body-${run}.jpg`), alignment: 'left', caption: 'Body caption' })
    expect(blocks[2]).toMatchObject({ blockType: 'embed', url: 'https://twitter.com/WUWF/status/1285659380751499264?ref_src=x', caption: 'Cases are rising.' }) // kept as pasted; the block resolves the canonical address when it renders
    expect(blocks[4]).toMatchObject({ blockType: 'audioPlayer', audio: ids.get(`https://cpa.ds.npr.org/wuwf/audio/interview-${run}.wav`), title: 'Full interview' })
    // nothing in what was saved is a token, a script or a script address
    expect(JSON.stringify(back.content)).not.toMatch(/\$asset|<script|widgets\.js/)
  })

  it('a second import of the same page is refused, not duplicated (the Grove id is unique)', async () => {
    const r = convertStory({ ...page(), contentId: `00000170-20c3-df2b-ab7b-9${run.padEnd(11, '0').slice(0, 11)}`, canonicalLink: `https://www.wuwf.org/local-news/2016-03-13/grove-converter-twice-${run}` })
    if (r.status !== 'converted') throw new Error('not converted')
    const once = await payload.create({ collection: 'posts', overrideAccess: true, context: { disableRevalidate: true }, draft: true, data: { title: 'Once', section: await ensureTestSection(payload), legacy: { groveId: r.story.legacy.groveId, legacyPath: r.story.path }, content: { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [] }] } } } as never })
    made.push({ collection: 'posts', id: once.id })
    await expect(payload.create({ collection: 'posts', overrideAccess: true, context: { disableRevalidate: true }, draft: true, data: { title: 'Twice', section: await ensureTestSection(payload), legacy: { groveId: r.story.legacy.groveId, legacyPath: `${r.story.path}-copy` }, content: { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [] }] } } } as never })).rejects.toThrow()
  })
})
