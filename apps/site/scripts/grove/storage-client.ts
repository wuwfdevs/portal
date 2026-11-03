// A read/write handle on the bucket the site's files live in, for the Grove scripts. It uses the same S3_* settings the site
// does (nothing here is a second source of truth) and never prints a key. `head(key)` answers true/false for "is this object
// there"; any other answer (a refused login, a wrong bucket) throws, because that is not the same as "missing".

import { describeStorageTarget, type StorageTarget } from '../../src/lib/assets/storage-verify'

export interface Storage {
  target: StorageTarget
  head: (key: string) => Promise<boolean>
  /** Writes, reads back and removes one small object. Throws, saying which step failed. */
  selfTest: () => Promise<void>
}

/** Null when the settings are incomplete (the caller decides whether that is allowed). */
export async function openStorage(env: Record<string, string | undefined> = process.env): Promise<Storage | null> {
  const target = describeStorageTarget(env)
  if (!target.configured) return null
  const { S3Client, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3')
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: target.region,
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID ?? '', secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '' },
  })
  const head = async (key: string): Promise<boolean> => {
    try {
      await client.send(new HeadObjectCommand({ Bucket: target.bucket!, Key: key }))
      return true
    } catch (e) {
      const err = e as { name?: string; $metadata?: { httpStatusCode?: number } }
      if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return false
      throw e
    }
  }
  const selfTest = async () => {
    const probe = `import-selftest/${Date.now()}.txt`
    await client.send(new PutObjectCommand({ Bucket: target.bucket!, Key: probe, Body: 'storage self-test', ContentType: 'text/plain' }))
    if (!(await head(probe))) throw new Error(`storage self-test: wrote ${probe} to ${target.bucket} but could not read it back`)
    await client.send(new DeleteObjectCommand({ Bucket: target.bucket!, Key: probe }))
  }
  return { target, head, selfTest }
}
