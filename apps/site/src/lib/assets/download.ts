// Copies one file from where Grove served it. One request at a time, spaced apart, with the same neutral headers as the
// census (no contact information of any kind), robots.txt honoured per host, https and public hosts only, and a size
// cap per kind. Network, clock and disk are injected so every rule is tested without touching a real server.

import { createHash } from 'node:crypto'

import { parseRobots, type RobotsPolicy } from '../census/robots'
import { USER_AGENT, buildHeaders } from '../census/runner'
import { isPublicHost } from '../embeds'

export type AssetKind = 'image' | 'audio' | 'video'

/** Payload accepts at most 150 MiB a file (payload.config.ts); a bigger file could not be saved anyway. */
export const MAX_BYTES: Record<AssetKind, number> = { image: 60 * 1024 * 1024, audio: 150 * 1024 * 1024, video: 150 * 1024 * 1024 }

export type DownloadResult =
  | { status: 'ok'; sha256: string; bytes: number; contentType: string; data: Buffer; finalUrl: string }
  /** The server said the file is gone (404, 410). A result, not a failure: the story points at a dead file. */
  | { status: 'missing'; httpStatus: number }
  /** Not fetched, on purpose: robots.txt, not https, a private host, too big, or not the kind of file it should be. */
  | { status: 'refused'; reason: 'robots' | 'not_https' | 'private_host' | 'too_big' | 'wrong_type' | 'bad_redirect' | 'forbidden' }
  | { status: 'failed'; error: string }

export interface DownloaderDeps {
  fetch: typeof fetch
  sleep: (ms: number) => Promise<void>
  now: () => number
  log?: (msg: string) => void
}
export interface DownloaderOptions {
  minIntervalMs: number
  maxRetries: number
  backoffBaseMs: number
  maxRetryAfterMs: number
  /** Redirects followed (each target is checked again). */
  maxHops: number
}
export const DEFAULT_OPTIONS: DownloaderOptions = { minIntervalMs: 3000, maxRetries: 3, backoffBaseMs: 5000, maxRetryAfterMs: 120_000, maxHops: 3 }

const RETRYABLE = new Set([429, 500, 502, 503, 504])
const REDIRECTS = new Set([301, 302, 303, 307, 308])

/** Whether the server's content type is acceptable for the kind. A generic type is let through; the importer re-checks the bytes. */
export function typeMatches(kind: AssetKind, contentType: string): boolean {
  const t = contentType.split(';')[0]!.trim().toLowerCase()
  if (!t || t === 'application/octet-stream' || t === 'binary/octet-stream') return true
  if (kind === 'image') return t.startsWith('image/')
  if (kind === 'audio') return t.startsWith('audio/') || t === 'application/ogg'
  return t.startsWith('video/')
}

export class AssetDownloader {
  private lastEnd: number | null = null
  private robots = new Map<string, RobotsPolicy | 'unavailable'>()
  requests = 0

  constructor(
    private deps: DownloaderDeps,
    private opts: DownloaderOptions = DEFAULT_OPTIONS,
  ) {}

  private async turn(): Promise<void> {
    if (this.lastEnd === null) return
    const wait = this.lastEnd + this.opts.minIntervalMs - this.deps.now()
    if (wait > 0) await this.deps.sleep(wait)
  }

  /** One spaced request; the body is not read here. */
  private async request(url: URL, accept: string): Promise<Response> {
    await this.turn()
    this.requests++
    try {
      return await this.deps.fetch(url, { headers: buildHeaders(accept), redirect: 'manual' })
    } finally {
      this.lastEnd = this.deps.now()
    }
  }

  private async policyFor(url: URL): Promise<RobotsPolicy | 'unavailable'> {
    const cached = this.robots.get(url.host)
    if (cached) return cached
    let policy: RobotsPolicy | 'unavailable'
    try {
      const res = await this.request(new URL('/robots.txt', url.origin), 'text/plain')
      if (res.status === 200) policy = parseRobots(await res.text(), USER_AGENT)
      else if (res.status >= 500) policy = 'unavailable'
      else policy = parseRobots('', USER_AGENT) // no robots.txt (or none we may read): nothing is disallowed
    } catch {
      policy = 'unavailable'
    }
    // A robots.txt we could not read is not remembered, so the next file tries again instead of assuming either way.
    if (policy !== 'unavailable') this.robots.set(url.host, policy)
    return policy
  }

  async download(sourceUrl: string, kind: AssetKind): Promise<DownloadResult> {
    let url: URL
    try {
      url = new URL(sourceUrl)
    } catch {
      return { status: 'failed', error: 'not a URL' }
    }
    let lastError = 'unknown'
    for (let hop = 0; hop <= this.opts.maxHops; hop++) {
      if (url.protocol !== 'https:') return { status: 'refused', reason: 'not_https' }
      if (!isPublicHost(url.hostname)) return { status: 'refused', reason: 'private_host' }
      const policy = await this.policyFor(url)
      if (policy === 'unavailable') return { status: 'failed', error: `robots.txt for ${url.host} could not be read` }
      if (!policy.isAllowed(url.pathname + url.search)) return { status: 'refused', reason: 'robots' }
      if (policy.crawlDelaySeconds && policy.crawlDelaySeconds * 1000 > this.opts.minIntervalMs) {
        this.opts = { ...this.opts, minIntervalMs: policy.crawlDelaySeconds * 1000 }
      }

      let res: Response | null = null
      for (let attempt = 0; attempt <= this.opts.maxRetries; attempt++) {
        if (attempt > 0) {
          const backoff = this.opts.backoffBaseMs * 2 ** (attempt - 1)
          this.deps.log?.(`retry ${attempt}/${this.opts.maxRetries} ${url.pathname} in ${Math.round(backoff / 1000)}s (${lastError})`)
          await this.deps.sleep(backoff)
        }
        try {
          res = await this.request(url, '*/*')
        } catch (e) {
          lastError = `network: ${(e as Error).message}`
          res = null
          continue
        }
        if (RETRYABLE.has(res.status)) {
          lastError = `HTTP ${res.status}`
          const ra = Number(res.headers.get('retry-after'))
          if (Number.isFinite(ra) && ra > 0) await this.deps.sleep(Math.min(ra * 1000, this.opts.maxRetryAfterMs))
          await res.body?.cancel().catch(() => undefined)
          res = null
          continue
        }
        break
      }
      if (!res) return { status: 'failed', error: lastError }

      if (res.status === 403 || res.status === 401) {
        await res.body?.cancel().catch(() => undefined)
        return { status: 'refused', reason: 'forbidden' }
      }
      if (res.status === 404 || res.status === 410) {
        await res.body?.cancel().catch(() => undefined)
        return { status: 'missing', httpStatus: res.status }
      }
      if (REDIRECTS.has(res.status)) {
        const loc = res.headers.get('location')
        await res.body?.cancel().catch(() => undefined)
        try {
          url = new URL(loc ?? '', url)
        } catch {
          return { status: 'refused', reason: 'bad_redirect' }
        }
        continue
      }
      if (res.status !== 200) return { status: 'failed', error: `HTTP ${res.status}` }

      const contentType = res.headers.get('content-type') ?? ''
      if (!typeMatches(kind, contentType)) {
        await res.body?.cancel().catch(() => undefined)
        return { status: 'refused', reason: 'wrong_type' }
      }
      const cap = MAX_BYTES[kind]
      const declared = Number(res.headers.get('content-length'))
      if (Number.isFinite(declared) && declared > cap) {
        await res.body?.cancel().catch(() => undefined)
        return { status: 'refused', reason: 'too_big' }
      }
      const chunks: Uint8Array[] = []
      let bytes = 0
      try {
        const reader = res.body?.getReader()
        if (!reader) return { status: 'failed', error: 'no body' }
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          bytes += value.byteLength
          if (bytes > cap) {
            await reader.cancel().catch(() => undefined)
            return { status: 'refused', reason: 'too_big' }
          }
          chunks.push(value)
        }
      } catch (e) {
        return { status: 'failed', error: `read: ${(e as Error).message}` }
      }
      const data = Buffer.concat(chunks)
      if (data.length === 0) return { status: 'failed', error: 'empty body' }
      return { status: 'ok', sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length, contentType, data, finalUrl: url.toString() }
    }
    return { status: 'refused', reason: 'bad_redirect' }
  }
}

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', aac: 'audio/aac',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
}

/** The type to save a file under: the server's, unless it was generic, then the file name's extension. Null if neither says. */
export function mimeFor(kind: AssetKind, contentType: string, sourceUrl: string): string | null {
  const t = contentType.split(';')[0]!.trim().toLowerCase()
  if (t && t !== 'application/octet-stream' && t !== 'binary/octet-stream' && typeMatches(kind, t)) return t
  let ext = ''
  try {
    ext = new URL(sourceUrl).pathname.split('.').pop()?.toLowerCase() ?? ''
  } catch {
    /* not a URL */
  }
  const byExt = EXTENSION_TYPES[ext]
  return byExt && typeMatches(kind, byExt) ? byExt : null
}
