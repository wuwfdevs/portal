import { describe, expect, it } from 'vitest'

import { describeStorageTarget, expectedKeys, missingKeys } from './storage-verify'

describe('expectedKeys', () => {
  it('is the original and every size, under the collection folder', () => {
    expect(
      expectedKeys({ filename: 'a.jpg', prefix: 'media', sizes: { thumbnail: { filename: 'a-300x200.jpg' }, large: { filename: 'a-1400x933.jpg' }, og: null, square: {} } }, 'media'),
    ).toEqual(['media/a.jpg', 'media/a-300x200.jpg', 'media/a-1400x933.jpg'])
  })
  it('falls back to the collection prefix when the record has none, and lists a plain file once', () => {
    expect(expectedKeys({ filename: 'story.mp3' }, 'audio')).toEqual(['audio/story.mp3'])
    expect(expectedKeys({ filename: 'a.jpg', sizes: { x: { filename: 'a.jpg' } } }, 'media')).toEqual(['media/a.jpg'])
  })
  it('puts a browser upload under its object key, and tolerates stray slashes', () => {
    expect(expectedKeys({ filename: 'a.jpg', prefix: '/media/', _objectKey: 'k1' }, 'media')).toEqual(['media/k1/a.jpg'])
  })
  it('is empty for a record with no file', () => {
    expect(expectedKeys({}, 'media')).toEqual([])
    expect(expectedKeys({ filename: '' }, 'media')).toEqual([])
  })
})

describe('missingKeys', () => {
  it('names only the keys the bucket does not have', async () => {
    const there = new Set(['media/a.jpg'])
    expect(await missingKeys(['media/a.jpg', 'media/b.jpg'], async (k) => there.has(k))).toEqual(['media/b.jpg'])
    expect(await missingKeys(['media/a.jpg'], async (k) => there.has(k))).toEqual([])
    expect(await missingKeys([], async () => false)).toEqual([])
  })
  it('does not turn a failure to ask into "missing": it passes the error on', async () => {
    await expect(missingKeys(['x'], async () => { throw new Error('403 Forbidden') })).rejects.toThrow('403')
  })
})

describe('describeStorageTarget', () => {
  const full = { S3_BUCKET: 'wuwf-site-files', S3_ENDPOINT: 'https://ref.storage.supabase.co/storage/v1/s3', S3_REGION: 'us-east-1', S3_ACCESS_KEY_ID: 'id', S3_SECRET_ACCESS_KEY: 'secret' }
  it('is configured with a bucket, keys and a good endpoint, and shows only the host', () => {
    const t = describeStorageTarget(full)
    expect(t).toEqual({ configured: true, bucket: 'wuwf-site-files', endpointHost: 'ref.storage.supabase.co', region: 'us-east-1', problems: [] })
    expect(JSON.stringify(t)).not.toContain('secret')
  })
  it('says what is missing, in words, and never echoes a value', () => {
    const t = describeStorageTarget({ S3_ENDPOINT: 'not a url' })
    expect(t.configured).toBe(false)
    expect(t.problems).toEqual(['S3_BUCKET is not set', 'S3_ACCESS_KEY_ID is not set', 'S3_SECRET_ACCESS_KEY is not set', 'S3_ENDPOINT is not a web address'])
    expect(describeStorageTarget({}).region).toBe('us-east-1')
  })
})
