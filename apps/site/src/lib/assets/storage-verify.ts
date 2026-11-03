// Proving that a file saved to the library is really in storage. The CMS can hold a record whose file never arrived (storage
// not switched on in that process, a wrong bucket, a refused write that was swallowed), and nothing in the record says so. The
// importer therefore asks the bucket after every save. Pure: the question is put through a `head` function the caller supplies,
// so every rule here is tested without a network. No secret is read, printed or returned.

export interface StoredFileDoc {
  filename?: string | null
  /** The folder the upload plugin recorded for the file (normally the collection's prefix). */
  prefix?: string | null
  /** A browser upload lands in `<prefix>/<_objectKey>/`; a server upload has none. */
  _objectKey?: string | null
  sizes?: Record<string, { filename?: string | null } | null | undefined> | null
}

const join = (...parts: (string | null | undefined)[]): string =>
  parts
    .filter((p): p is string => Boolean(p))
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')

/** Every object a record must have in the bucket: the original and each generated size, at the keys the file route reads. */
export function expectedKeys(doc: StoredFileDoc, collectionPrefix: string): string[] {
  const folder = join(doc.prefix || collectionPrefix, doc._objectKey)
  const names = [doc.filename, ...Object.values(doc.sizes ?? {}).map((s) => s?.filename)].filter((n): n is string => typeof n === 'string' && n !== '')
  return [...new Set(names.map((n) => join(folder, n)))]
}

/** The keys that are not in the bucket. `head` answers true when the object exists, false when it does not, and throws on anything else (a refused login is not "missing"). */
export async function missingKeys(keys: readonly string[], head: (key: string) => Promise<boolean>): Promise<string[]> {
  const found = await Promise.all(keys.map(async (k) => ({ k, there: await head(k) })))
  return found.filter((f) => !f.there).map((f) => f.k)
}

export interface StorageEnv {
  [key: string]: string | undefined
  S3_BUCKET?: string
  S3_ENDPOINT?: string
  S3_REGION?: string
  S3_ACCESS_KEY_ID?: string
  S3_SECRET_ACCESS_KEY?: string
}

export interface StorageTarget {
  configured: boolean
  bucket: string | null
  /** Host only, no path and no credentials. */
  endpointHost: string | null
  region: string
  /** Why files would not reach the bucket, in words. Empty when the settings are complete. */
  problems: string[]
}

/** What storage settings the process has, described without revealing any secret (only whether each is present). */
export function describeStorageTarget(env: StorageEnv): StorageTarget {
  const problems: string[] = []
  if (!env.S3_BUCKET) problems.push('S3_BUCKET is not set')
  if (!env.S3_ACCESS_KEY_ID) problems.push('S3_ACCESS_KEY_ID is not set')
  if (!env.S3_SECRET_ACCESS_KEY) problems.push('S3_SECRET_ACCESS_KEY is not set')
  let endpointHost: string | null = null
  if (env.S3_ENDPOINT) {
    try {
      endpointHost = new URL(env.S3_ENDPOINT).host
    } catch {
      problems.push('S3_ENDPOINT is not a web address')
    }
  }
  return { configured: problems.length === 0, bucket: env.S3_BUCKET || null, endpointHost, region: env.S3_REGION || 'us-east-1', problems }
}
