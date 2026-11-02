// The census run loop: one request at a time, at least `minIntervalMs` apart, resumable, stops when asked to.
// Network, clock and disk are injected, so every rule here is tested without touching wuwf.org.

import { createHash } from 'node:crypto'

import { classifyPath } from './universe'
import type { RobotsPolicy } from './robots'
import { addPage, shouldKeepRaw, emptyTally, type OriginClass, type Tally } from './tally'

// ---------------------------------------------------------------------------------------------------------------
// What we send. Nothing identifying: no email, no URL, no From, no session link (owner's instruction, 2026-11-02).

export const USER_AGENT = 'WUWF-migration-research'

export function buildHeaders(accept: string): Record<string, string> {
  const h = { 'User-Agent': USER_AGENT, Accept: accept }
  assertNeutralHeaders(h)
  return h
}

const ALLOWED_HEADER_NAMES = new Set(['user-agent', 'accept'])

export function assertNeutralHeaders(headers: Record<string, string>): void {
  for (const [name, value] of Object.entries(headers)) {
    if (!ALLOWED_HEADER_NAMES.has(name.toLowerCase())) throw new Error(`Header "${name}" is not allowed on census requests.`)
    if (/[@]|:\/\/|\b[\w-]+\.(com|org|net|edu|gov|io|dev|app)\b|claude|anthropic|session/i.test(value)) {
      throw new Error(`Header "${name}" looks like it carries contact or identifying information.`)
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The throttled client

export interface ClientDeps {
  fetch: typeof fetch
  sleep: (ms: number) => Promise<void>
  now: () => number
  log?: (msg: string) => void
}

export interface ClientOptions {
  baseUrl: string
  minIntervalMs: number
  maxRetries: number
  backoffBaseMs: number
  maxRetryAfterMs: number
}

export type GetResult =
  | { kind: 'ok'; status: number; contentType: string; body: string; finalPath: string }
  | { kind: 'final'; status: number; finalPath: string; note?: string }
  | { kind: 'forbidden'; status: number }
  | { kind: 'failed'; status: number | null; error: string }

const RETRYABLE = new Set([429, 500, 502, 503, 504])
const REDIRECTS = new Set([301, 302, 303, 307, 308])

export class ThrottledClient {
  private lastEnd: number | null = null
  requests = 0

  constructor(
    private deps: ClientDeps,
    private opts: ClientOptions,
  ) {}

  /** Wait until at least `minIntervalMs` have passed since the previous request ended. */
  private async turn(): Promise<void> {
    if (this.lastEnd === null) return
    const wait = this.lastEnd + this.opts.minIntervalMs - this.deps.now()
    if (wait > 0) await this.deps.sleep(wait)
  }

  async get(pathAndQuery: string, accept = 'application/json', hops = 2): Promise<GetResult> {
    const url = new URL(pathAndQuery, this.opts.baseUrl)
    const headers = buildHeaders(accept)
    let lastError = 'unknown'
    let lastStatus: number | null = null

    for (let attempt = 0; attempt <= this.opts.maxRetries; attempt++) {
      if (attempt > 0) {
        const backoff = this.opts.backoffBaseMs * 2 ** (attempt - 1)
        this.deps.log?.(`retry ${attempt}/${this.opts.maxRetries} for ${pathAndQuery} in ${Math.round(backoff / 1000)}s (${lastError})`)
        await this.deps.sleep(backoff)
      }
      await this.turn()
      this.requests++
      let res: Response
      try {
        res = await this.deps.fetch(url, { headers, redirect: 'manual' })
      } catch (e) {
        this.lastEnd = this.deps.now()
        lastError = `network: ${(e as Error).message}`
        lastStatus = null
        continue
      }
      this.lastEnd = this.deps.now()
      lastStatus = res.status

      if (res.status === 403) return { kind: 'forbidden', status: 403 }

      if (REDIRECTS.has(res.status)) {
        const loc = res.headers.get('location')
        let target: URL | null = null
        try {
          target = loc ? new URL(loc, url) : null
        } catch {
          target = null
        }
        if (target && target.host === new URL(this.opts.baseUrl).host && hops > 0) {
          if (!target.searchParams.has('_renderer') && url.searchParams.has('_renderer')) {
            target.searchParams.set('_renderer', url.searchParams.get('_renderer') as string)
          }
          return this.get(target.pathname + target.search, accept, hops - 1)
        }
        return { kind: 'final', status: res.status, finalPath: url.pathname, note: `redirect to ${target ? target.host + target.pathname : '(none)'} not followed` }
      }

      if (RETRYABLE.has(res.status)) {
        lastError = `HTTP ${res.status}`
        const ra = Number(res.headers.get('retry-after'))
        if (Number.isFinite(ra) && ra > 0) {
          const wait = Math.min(ra * 1000, this.opts.maxRetryAfterMs)
          this.deps.log?.(`Retry-After ${ra}s for ${pathAndQuery}`)
          await this.deps.sleep(wait)
        }
        continue
      }

      if (res.status === 200) {
        let body: string
        try {
          body = await res.text()
        } catch (e) {
          lastError = `read: ${(e as Error).message}`
          continue
        }
        return { kind: 'ok', status: 200, contentType: res.headers.get('content-type') ?? '', body, finalPath: url.pathname }
      }

      // 404, 410, other 4xx: the server answered; that is a result, not a failure.
      return { kind: 'final', status: res.status, finalPath: url.pathname }
    }
    return { kind: 'failed', status: lastStatus, error: lastError }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// State

export type Renderer = 'json' | 'styleguide'

export interface Row {
  path: string
  group: string
  stratum: string
  renderer: Renderer
  status: number | null
  bytes: number | null
  sha256: string | null
  fetchedAt: string
  tallied: boolean
  template: string | null
  publishedAt: string | null
  origin: OriginClass | null
  canonicalHost: string | null
  contentId: string | null
  rawKept: boolean
  finalPath?: string
  note?: string
}

export interface CensusState {
  version: 1
  seed: string
  rows: Row[]
  tally: Tally
}

export const newState = (seed: string): CensusState => ({ version: 1, seed, rows: [], tally: emptyTally() })

const keyOf = (renderer: Renderer, path: string): string => `${renderer}:${path}`

/** The tally group a row's page was counted in. */
export const tallyGroupOf = (r: Pick<Row, 'group' | 'renderer'>): string => (r.renderer === 'styleguide' ? `${r.group}:styleguide` : r.group)
const isFailedRow = (r: Row): boolean => r.note?.startsWith('failed') === true

export interface RunItem {
  path: string
  group: string
  stratum: string
}

export interface RunOptions {
  items: readonly RunItem[]
  renderer: Renderer
  robots: RobotsPolicy
  /** Stop after this many requested pages in this call (a chunk). */
  maxPages?: number
  maxConsecutiveFailures?: number
  /** Asked before each page; true ends this chunk cleanly (the real one is a wall-clock limit). */
  shouldStop?: () => boolean
  /** Called after every item with the whole state; the real one writes it to disk atomically. */
  checkpoint?: (state: CensusState) => void
  saveRaw?: (sha256: string, body: string) => void
  now?: () => Date
}

export type StopReason = 'done' | 'max-pages' | 'time' | 'failures' | 'forbidden'

export async function runCensus(state: CensusState, client: ThrottledClient, opts: RunOptions): Promise<{ stopped: StopReason; fetched: number }> {
  const maxFailures = opts.maxConsecutiveFailures ?? 5
  const now = opts.now ?? (() => new Date())
  const done = new Set(state.rows.filter((r) => !isFailedRow(r)).map((r) => keyOf(r.renderer, r.path)))
  let fetched = 0
  let consecutiveFailures = 0

  for (const item of opts.items) {
    if (done.has(keyOf(opts.renderer, item.path))) continue
    if (opts.maxPages !== undefined && fetched >= opts.maxPages) return { stopped: 'max-pages', fetched }
    if (opts.shouldStop?.()) return { stopped: 'time', fetched }

    const base: Row = {
      path: item.path,
      group: item.group,
      stratum: item.stratum,
      renderer: opts.renderer,
      status: null,
      bytes: null,
      sha256: null,
      fetchedAt: now().toISOString(),
      tallied: false,
      template: null,
      publishedAt: null,
      origin: null,
      canonicalHost: null,
      contentId: null,
      rawKept: false,
    }
    // A failed attempt from an earlier chunk is replaced, not duplicated.
    state.rows = state.rows.filter((r) => !(isFailedRow(r) && r.renderer === opts.renderer && r.path === item.path))

    const target = `${item.path}?_renderer=${opts.renderer}`
    if (!opts.robots.isAllowed(target)) {
      state.rows.push({ ...base, note: 'robots-disallowed' })
      opts.checkpoint?.(state)
      continue
    }

    const res = await client.get(target)
    fetched++

    if (res.kind === 'forbidden') return { stopped: 'forbidden', fetched }

    if (res.kind === 'failed') {
      consecutiveFailures++
      state.rows.push({ ...base, status: res.status, note: `failed: ${res.error}` })
      opts.checkpoint?.(state)
      if (consecutiveFailures >= maxFailures) return { stopped: 'failures', fetched }
      continue
    }
    consecutiveFailures = 0

    if (res.kind === 'final') {
      state.rows.push({ ...base, status: res.status, finalPath: res.finalPath, note: res.note })
      opts.checkpoint?.(state)
      continue
    }

    const sha256 = createHash('sha256').update(res.body).digest('hex')
    const bytes = Buffer.byteLength(res.body)
    let json: unknown
    try {
      json = JSON.parse(res.body)
    } catch {
      state.rows.push({ ...base, status: res.status, bytes, sha256, finalPath: res.finalPath, note: 'not-json' })
      opts.checkpoint?.(state)
      continue
    }

    const info = classifyPath(item.path)
    const facts = addPage(state.tally, tallyGroupOf({ group: item.group, renderer: opts.renderer }), item.path, json, { date: info.date, section: info.section })
    const keep = shouldKeepRaw(facts.origin)
    if (keep) opts.saveRaw?.(sha256, res.body)
    state.rows.push({
      ...base,
      status: res.status,
      bytes,
      sha256,
      tallied: true,
      template: facts.template,
      publishedAt: facts.publishedAt,
      origin: facts.origin,
      canonicalHost: facts.canonicalHost,
      contentId: facts.contentId,
      rawKept: keep,
      finalPath: res.finalPath !== item.path ? res.finalPath : undefined,
    })
    opts.checkpoint?.(state)
  }
  return { stopped: 'done', fetched }
}
