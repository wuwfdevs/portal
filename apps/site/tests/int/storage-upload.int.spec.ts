// @vitest-environment node
import http from 'node:http'
import type { AddressInfo } from 'node:net'

import type { Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { expectedKeys, missingKeys } from '@/lib/assets/storage-verify'

// The importer saves library files with `payload.create({ collection, file })`, on the server. With the real storage settings
// (`clientUploads: true`, which is for editors' browsers) that call must still put every file in the bucket, under the
// collection's folder. This runs the real config against a small in-process S3 stand-in, so it needs no network and no keys.
//
// It also pins down the bug the first staging rehearsal hit: the storage plugin keeps state on a call's `context` (the file being
// uploaded, and a flag that skips its own follow-up write) and leaves it there. Reuse one context object for several creates and
// every upload after the first is silently skipped: the record is saved, the file never reaches the bucket.

const objects = new Map<string, number>()
let server: http.Server
let payload: Payload
const created: { collection: 'media' | 'audio' | 'video'; id: string | number }[] = []
const saved: Record<string, string | undefined> = {}
const ENV = ['S3_BUCKET', 'S3_ENDPOINT', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const
const ctx = () => ({ disableRevalidate: true }) // a fresh object per call, as the importer does
const head = async (key: string) => objects.has(`/test-bucket/${key}`)
const run = Date.now().toString(36)

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const key = decodeURIComponent((req.url ?? '').split('?')[0]!)
      if (req.method === 'PUT') {
        objects.set(key, Buffer.concat(chunks).length)
        res.writeHead(200, { ETag: '"x"' })
      } else if (req.method === 'HEAD') res.writeHead(objects.has(key) ? 200 : 404, objects.has(key) ? { 'Content-Length': objects.get(key)! } : {})
      else if (req.method === 'DELETE') {
        objects.delete(key)
        res.writeHead(204)
      } else res.writeHead(200)
      res.end()
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  for (const k of ENV) saved[k] = process.env[k]
  Object.assign(process.env, { S3_BUCKET: 'test-bucket', S3_ENDPOINT: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, S3_REGION: 'us-east-1', S3_ACCESS_KEY_ID: 'local-test', S3_SECRET_ACCESS_KEY: 'local-test' })
  // The settings are read when the config module loads, so the config is imported only now.
  const { getPayload } = await import('payload')
  const config = (await import('@/payload.config')).default
  payload = await getPayload({ config: await config })
}, 90_000)

afterAll(async () => {
  for (const { collection, id } of created.reverse()) await payload.delete({ collection, id, overrideAccess: true, context: ctx() }).catch(() => undefined)
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  await new Promise<void>((r) => server.close(() => r()))
})

describe('files saved by the importer reach storage', () => {
  it('puts a picture and each of its sizes in the bucket under media/, and the record says where', async () => {
    const jpg = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: { r: 30, g: 90, b: 160 } } }).jpeg().toBuffer()
    const doc = await payload.create({ collection: 'media', overrideAccess: true, context: ctx(), file: { data: jpg, mimetype: 'image/jpeg', name: `pexels-test-${run}.jpg`, size: jpg.length }, data: { alt: 'x', legacy: { sourceUrl: `https://example.test/${run}.jpg` } } as never })
    created.push({ collection: 'media', id: doc.id })
    const keys = expectedKeys(doc as never, 'media')
    expect(keys.length).toBeGreaterThan(3) // the original and the generated sizes
    expect(keys[0]).toBe(`media/pexels-test-${run}.jpg`)
    expect(keys.every((k) => k.startsWith('media/'))).toBe(true)
    expect(await missingKeys(keys, head)).toEqual([])
    expect(doc.url).toBe(`/api/media/file/pexels-test-${run}.jpg?prefix=media`)
  })

  it('puts an audio file under audio/ and a video under video/', async () => {
    // Just enough real structure for the upload's content check: an ID3 tag for MP3, an `ftyp` box for MP4.
    const mp3 = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 0x03, 0, 0, 0, 0, 0, 0]), Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(2048, 0)])
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.from([0, 0, 2, 0]), Buffer.from('isomiso2'), Buffer.alloc(2048, 0)])
    const audio = await payload.create({ collection: 'audio', overrideAccess: true, context: ctx(), file: { data: mp3, mimetype: 'audio/mpeg', name: `clip-${run}.mp3`, size: mp3.length }, data: { title: 'clip', legacy: { sourceUrl: `https://example.test/${run}.mp3` } } as never })
    created.push({ collection: 'audio', id: audio.id })
    expect(await missingKeys([`audio/clip-${run}.mp3`], head)).toEqual([])
    expect(expectedKeys(audio as never, 'audio')).toEqual([`audio/clip-${run}.mp3`])

    const video = await payload.create({ collection: 'video', overrideAccess: true, context: ctx(), file: { data: mp4, mimetype: 'video/mp4', name: `clip-${run}.mp4`, size: mp4.length }, data: { title: 'clip', legacy: { sourceUrl: `https://example.test/${run}.mp4` } } as never })
    created.push({ collection: 'video', id: video.id })
    expect(await missingKeys([`video/clip-${run}.mp4`], head)).toEqual([])
  })

  it('reports a file that is not there, so a record with no file cannot pass for saved', async () => {
    expect(await missingKeys(['media/never-uploaded.jpg'], head)).toEqual(['media/never-uploaded.jpg'])
  })

  it('KNOWN HAZARD: one context object shared by several creates loses the later uploads (why the importer copies it per call)', async () => {
    const shared = { disableRevalidate: true }
    const mp3 = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 0x03, 0, 0, 0, 0, 0, 0]), Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(2048, 0)])
    const names = [`shared-a-${run}.mp3`, `shared-b-${run}.mp3`, `shared-c-${run}.mp3`]
    for (const [i, name] of names.entries()) {
      const d = await payload.create({ collection: 'audio', overrideAccess: true, context: shared, file: { data: mp3, mimetype: 'audio/mpeg', name, size: mp3.length }, data: { title: name, legacy: { sourceUrl: `https://example.test/${run}-shared-${i}.mp3` } } as never })
      created.push({ collection: 'audio', id: d.id })
    }
    const gone = await missingKeys(names.map((n) => `audio/${n}`), head)
    // The record exists for all three; the bucket does not have them all. If Payload fixes this, this test fails and the
    // per-call copy in the importer can be reconsidered.
    expect(gone.length).toBeGreaterThan(0)
  })

  it('the importer never hands its shared context object to a Payload call', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(resolve(__dirname, '../../scripts/grove/import.ts'), 'utf8')
    expect(source.match(/context:\s*ctx\b/g) ?? []).toEqual([])
    expect((source.match(/context:\s*\{\s*\.\.\.ctx\s*\}/g) ?? []).length).toBeGreaterThan(5)
  })
})
