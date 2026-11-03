// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureTestSection } from '../helpers/section'

// The media and audio libraries, and what opens a story: one featured picture, gallery or video, and an optional
// featured audio. These are the fields the Grove migration fills, so what they accept and refuse is pinned here.

const run = Date.now().toString(36)
let payload: Payload
const made: { collection: 'media' | 'audio' | 'video' | 'posts'; id: number | string }[] = []

const as = (role: string) => ({ id: 1, collection: 'users', email: `${role}@wuwf.org`, roles: [role] }) as never
const editor = as('editor')
const sponsorship = as('sponsorship')
const asUser = (user: unknown) => ({ overrideAccess: false, user: user as never, context: { disableRevalidate: true } })

const lexical = {
  root: {
    type: 'root', version: 1, direction: 'ltr', format: '', indent: 0,
    children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: 'Body.', format: 0, mode: 'normal', style: '', detail: 0 }] }],
  },
}

async function image(name: string) {
  const data = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } }).png().toBuffer()
  return { data, mimetype: 'image/png', name: `${name}-${run}.png`, size: data.length }
}
// Payload checks what a file really is, not what it is called, so the test audio is a genuine (silent) WAV file.
const wav = (name: string) => {
  const samples = 800 // 0.1 s of silence at 8 kHz, 8-bit mono
  const data = Buffer.alloc(44 + samples, 0x80)
  data.write('RIFF', 0); data.writeUInt32LE(36 + samples, 4); data.write('WAVE', 8)
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22)
  data.writeUInt32LE(8000, 24); data.writeUInt32LE(8000, 28); data.writeUInt16LE(1, 32); data.writeUInt16LE(8, 34)
  data.write('data', 36); data.writeUInt32LE(samples, 40)
  return { data, mimetype: 'audio/wav', name: `${name}-${run}.wav`, size: data.length }
}

const mp4 = (name: string) => {
  const data = fs.readFileSync(path.resolve(__dirname, '../fixtures/one-second.mp4'))
  return { data, mimetype: 'video/mp4', name: `${name}-${run}.mp4`, size: data.length }
}
async function makeVideo(name: string, data: Record<string, unknown> = {}) {
  const doc = await payload.create({ collection: 'video', overrideAccess: true, file: mp4(name), data: { title: name, ...data } as never })
  made.push({ collection: 'video', id: doc.id })
  return doc
}

async function makeMedia(name: string, data: Record<string, unknown> = {}) {
  const doc = await payload.create({ collection: 'media', overrideAccess: true, context: { disableRevalidate: true }, file: await image(name), data: { alt: name, ...data } as never })
  made.push({ collection: 'media', id: doc.id })
  return doc
}
async function makeAudio(name: string, data: Record<string, unknown> = {}) {
  const doc = await payload.create({ collection: 'audio', overrideAccess: true, file: wav(name), data: { title: name, ...data } as never })
  made.push({ collection: 'audio', id: doc.id })
  return doc
}
// Drafts skip validation by design, so a rule like "one featured item" only bites when a story is published.
async function makePost(extra: Record<string, unknown>, status: 'draft' | 'published' = 'draft') {
  const doc = await payload.create({
    collection: 'posts', overrideAccess: true, context: { disableRevalidate: true }, draft: status === 'draft',
    data: { title: `Featured ${run}-${made.length}`, content: lexical, section: await ensureTestSection(payload), _status: status, ...extra } as never,
  })
  made.push({ collection: 'posts', id: doc.id })
  return doc
}

describe('media and audio libraries, and featured story media', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  }, 60_000)
  afterAll(async () => {
    for (const { collection, id } of made.reverse())
      await payload.delete({ collection, id, overrideAccess: true, context: { disableRevalidate: true } }).catch(() => undefined)
  })

  describe('audio library access', () => {
    it('anyone can read an audio file, so a published story\'s player works for the public', async () => {
      const a = await makeAudio('readable')
      const found = await payload.findByID({ collection: 'audio', id: a.id, overrideAccess: false, user: undefined })
      expect(found.title).toBe('readable')
      expect(found.url).toBeTruthy()
    })

    it('content staff can add audio; sponsorship staff cannot', async () => {
      const ok = await payload.create({ collection: 'audio', ...asUser(editor), file: wav('by-editor'), data: { title: 'by editor' } as never })
      made.push({ collection: 'audio', id: ok.id })
      expect(ok.title).toBe('by editor')
      await expect(payload.create({ collection: 'audio', ...asUser(sponsorship), file: wav('by-sponsor'), data: { title: 'nope' } as never })).rejects.toThrow()
    })

    it('an audio file needs a title', async () => {
      await expect(payload.create({ collection: 'audio', overrideAccess: true, file: wav('untitled'), data: {} as never })).rejects.toThrow()
    })
  })

  describe('video library access', () => {
    it('anyone can read a video file; content staff can add one and sponsorship staff cannot', async () => {
      const v = await makeVideo('readable-video')
      expect((await payload.findByID({ collection: 'video', id: v.id, overrideAccess: false, user: undefined })).title).toBe('readable-video')
      const ok = await payload.create({ collection: 'video', ...asUser(editor), file: mp4('by-editor'), data: { title: 'by editor' } as never })
      made.push({ collection: 'video', id: ok.id })
      await expect(payload.create({ collection: 'video', ...asUser(sponsorship), file: mp4('by-sponsor'), data: { title: 'nope' } as never })).rejects.toThrow()
    })
    it('takes video files only', async () => {
      await expect(payload.create({ collection: 'video', overrideAccess: true, file: await image('not-a-video'), data: { title: 'wrong kind' } as never })).rejects.toThrow()
    })
    it('the same source address cannot be stored twice', async () => {
      const url = `https://npr.brightspotcdn.com/b8/${run}.mp4`
      await makeVideo('first-video', { legacy: { sourceUrl: url } })
      await expect(makeVideo('second-video', { legacy: { sourceUrl: url } })).rejects.toThrow()
    })
  })

  describe('library provenance (legacy.sourceUrl)', () => {
    it('the same source address cannot be stored twice, in media or in audio', async () => {
      const url = `https://cpa.ds.npr.org/wuwf/images/${run}.jpg`
      await makeMedia('first', { legacy: { sourceUrl: url } })
      await expect(makeMedia('second', { legacy: { sourceUrl: url } })).rejects.toThrow()
      const aurl = `https://cpa.ds.npr.org/wuwf/audio/${run}.mp3`
      await makeAudio('first-audio', { legacy: { sourceUrl: aurl } })
      await expect(makeAudio('second-audio', { legacy: { sourceUrl: aurl } })).rejects.toThrow()
    })

    it('once set it cannot be changed by staff, so provenance stays true', async () => {
      const url = `https://cpa.ds.npr.org/wuwf/images/fixed-${run}.jpg`
      const m = await makeMedia('fixed', { legacy: { sourceUrl: url } })
      const after = await payload.update({ collection: 'media', id: m.id, ...asUser(editor), data: { legacy: { sourceUrl: `https://evil.example/${run}.jpg` } } as never })
      expect(after.legacy?.sourceUrl).toBe(url)
    })

    it('carries credit and source, which a story use can then override', async () => {
      const m = await makeMedia('credited', { credit: 'Photo: A. Reporter / WUWF', source: 'WUWF archive' })
      const found = await payload.findByID({ collection: 'media', id: m.id, overrideAccess: true })
      expect(found.credit).toBe('Photo: A. Reporter / WUWF')
      expect(found.source).toBe('WUWF archive')
    })
  })

  describe('featured media and audio on a story', () => {
    it('keeps a featured picture with its own caption, credit, alt text and alignment', async () => {
      const m = await makeMedia('feature')
      const p = await makePost({
        featuredMedia: [{ blockType: 'mediaBlock', media: m.id, caption: 'A caption', credit: 'Use credit', source: 'Use source', altText: 'Use alt', alignment: 'center' }],
      })
      const read = await payload.findByID({ collection: 'posts', id: p.id, draft: true, depth: 0, overrideAccess: true })
      expect(read.featuredMedia).toHaveLength(1)
      expect(read.featuredMedia?.[0]).toMatchObject({ blockType: 'mediaBlock', media: m.id, caption: 'A caption', credit: 'Use credit', source: 'Use source', altText: 'Use alt', alignment: 'center' })
    })

    it('a featured gallery keeps slide titles, captions, credits and the carousel layout', async () => {
      const a = await makeMedia('slide-a')
      const b = await makeMedia('slide-b')
      const p = await makePost({
        featuredMedia: [{
          blockType: 'gallery', title: 'Storm damage', description: 'Day two', layout: 'carousel',
          images: [{ image: a.id, title: 'Roof', caption: 'Missing shingles', credit: 'Staff' }, { image: b.id, title: 'Street' }],
        }],
      })
      const read = await payload.findByID({ collection: 'posts', id: p.id, draft: true, depth: 0, overrideAccess: true })
      const g = read.featuredMedia?.[0]
      expect(g).toMatchObject({ blockType: 'gallery', layout: 'carousel', description: 'Day two' })
      expect(g && 'images' in g ? g.images?.map((i) => i.title) : []).toEqual(['Roof', 'Street'])
    })

    it('a featured video is an embed, and a post on X is kept as a link-only embed', async () => {
      const p = await makePost({
        featuredMedia: [{ blockType: 'embed', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'A video' }],
      })
      expect((await payload.findByID({ collection: 'posts', id: p.id, draft: true, depth: 0, overrideAccess: true })).featuredMedia?.[0]).toMatchObject({ blockType: 'embed' })
      await expect(
        makePost({ featuredMedia: [{ blockType: 'embed', url: 'https://x.com/NPR/status/1234567890123', title: 'A post' }] }),
      ).resolves.toBeTruthy()
    })

    it('a featured video keeps its caption and poster, and can open a story', async () => {
      const v = await makeVideo('featured-video')
      const poster = await makeMedia('poster')
      const p = await makePost({ featuredMedia: [{ blockType: 'videoPlayer', video: v.id, title: 'The Planets', caption: 'A performance', poster: poster.id }] }, 'published')
      const read = await payload.findByID({ collection: 'posts', id: p.id, depth: 0, overrideAccess: true })
      expect(read.featuredMedia?.[0]).toMatchObject({ blockType: 'videoPlayer', video: v.id, title: 'The Planets', caption: 'A performance', poster: poster.id })
    })

    it('opens with only one featured item', async () => {
      const m = await makeMedia('one-of-two')
      await expect(
        makePost({ featuredMedia: [{ blockType: 'mediaBlock', media: m.id }, { blockType: 'mediaBlock', media: m.id }] }, 'published'),
      ).rejects.toThrow()
    })

    it('does not store a block type that cannot open a story', async () => {
      // Payload does not reject an unknown block type: it simply is not kept. So the importer must only ever build the
      // allowed types (the generated Post type enforces that when the code is compiled), and this pins that it is dropped.
      const p = await makePost({ featuredMedia: [{ blockType: 'pullQuote', text: 'nope' }] }, 'published')
      const read = await payload.findByID({ collection: 'posts', id: p.id, depth: 0, overrideAccess: true })
      expect(read.featuredMedia ?? []).toHaveLength(0)
    })

    it('attaches one featured audio file, which the public can then reach through the story', async () => {
      const a = await makeAudio('story-audio', { durationSeconds: 247 })
      const p = await makePost({ featuredAudio: a.id })
      const read = await payload.findByID({ collection: 'posts', id: p.id, draft: true, depth: 1, overrideAccess: true })
      expect(typeof read.featuredAudio === 'object' && read.featuredAudio?.durationSeconds).toBe(247)
    })
  })

  describe('story body blocks', () => {
    it('the body no longer offers a promo card, and offers audio and video', async () => {
      const posts = payload.collections.posts.config
      const content = posts.flattenedFields.find((f) => f.name === 'content')
      const json = JSON.stringify(content, (_k, v) => (typeof v === 'function' ? undefined : v))
      expect(json).toContain('"audioPlayer"')
      expect(json).toContain('"videoPlayer"')
      expect(json).not.toContain('"slug":"promo"')
    })
  })
})
