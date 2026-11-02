// Per-story state while converting: the report, the files the story needs, and stable block ids. Plus the small
// URL and text helpers every module shares.

import { parseFragment } from 'parse5'
import type { DefaultTreeAdapterMap } from 'parse5'

import { stableId } from './lexical'
import type { AssetRef, AssetToken, ReportEntry, ReportLevel, StoryReport } from './types'

const SITE_HOSTS = new Set(['wuwf.org', 'www.wuwf.org'])
const SITE_ORIGIN = 'https://www.wuwf.org'

export class Ctx {
  readonly assets = new Map<string, AssetRef>()
  readonly entries: ReportEntry[] = []
  readonly mapped: Record<string, number> = {}
  private n = 0

  constructor(
    readonly seed: string,
    readonly embedHosts: readonly string[] = [],
  ) {}

  id(): string {
    return stableId(this.seed, this.n++)
  }
  count(kind: string, by = 1): void {
    this.mapped[kind] = (this.mapped[kind] ?? 0) + by
  }
  private add(level: ReportLevel, code: string, detail?: string): void {
    this.entries.push(detail === undefined ? { level, code } : { level, code, detail })
  }
  note(code: string, detail?: string): void {
    this.add('noted', code, detail)
  }
  preserve(code: string, detail?: string): void {
    this.add('preserved', code, detail)
  }
  fail(code: string, detail?: string): void {
    this.add('exception', code, detail)
  }

  /** Register a file the story needs and get the token that stands in for its library record. Repeats merge. */
  asset(ref: AssetRef): AssetToken {
    const seen = this.assets.get(ref.sourceUrl)
    if (!seen) this.assets.set(ref.sourceUrl, { ...ref })
    else for (const [k, v] of Object.entries(ref)) if (v !== undefined && (seen as unknown as Record<string, unknown>)[k] === undefined) (seen as unknown as Record<string, unknown>)[k] = v
    return { $asset: ref.sourceUrl }
  }

  report(path: string, groveId: string): StoryReport {
    const status = this.entries.some((e) => e.level === 'exception') ? 'exception' : this.entries.some((e) => e.level === 'preserved') ? 'review' : 'clean'
    return { path, groveId, status, mapped: { ...this.mapped }, entries: [...this.entries] }
  }
}

/** An absolute https address for something Grove points at, or null when it cannot be one (a data: URI, nothing). */
export function absoluteUrl(src: string | null | undefined): string | null {
  const s = (src ?? '').trim()
  if (!s || /^(data|javascript|blob|about):/i.test(s)) return null
  try {
    if (s.startsWith('//')) return new URL(`https:${s}`).toString()
    if (s.startsWith('/')) return new URL(s, SITE_ORIGIN).toString()
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

/**
 * The address a link in a story should carry: our own pages become relative (the paths are kept exactly, so they keep
 * working whatever the domain), other http(s), mailto and tel links are kept, and anything else (a javascript: link)
 * is refused.
 */
export function safeHref(href: string | null | undefined): { url: string } | { refused: string } | null {
  const h = (href ?? '').trim()
  if (!h) return null
  if (h.startsWith('#')) return { url: h }
  if (/^(mailto|tel):/i.test(h)) return { url: h }
  if (h.startsWith('/') && !h.startsWith('//')) return { url: h }
  // "www.example.org/page" has no scheme; it is plainly an address, so it gets https.
  const withScheme = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(h) ? `https://${h}` : h
  const abs = (() => {
    try {
      return new URL(withScheme.startsWith('//') ? `https:${withScheme}` : withScheme)
    } catch {
      return null
    }
  })()
  if (!abs) return { refused: h.slice(0, 40) }
  if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return { refused: abs.protocol }
  if (SITE_HOSTS.has(abs.hostname)) return { url: `${abs.pathname}${abs.search}${abs.hash}` || '/' }
  return { url: abs.toString() }
}

export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return 'invalid'
  }
}

type PNode = DefaultTreeAdapterMap['node']
const textOf = (nodes: PNode[]): string =>
  nodes
    .map((n) => (n.nodeName === '#text' ? (n as DefaultTreeAdapterMap['textNode']).value : 'childNodes' in n ? textOf(n.childNodes as PNode[]) : ''))
    .join('')

/** Text with markup removed and entities decoded, whitespace collapsed. `hadMarkup` is true when tags were thrown away. */
export function plainText(html: string | null | undefined): { text: string; hadMarkup: boolean } {
  const raw = html ?? ''
  const hadMarkup = /<\/?[a-z][^>]*>/i.test(raw)
  const text = textOf(parseFragment(raw).childNodes as PNode[]).replace(/[ \t\r\n\f ]+/g, ' ').trim()
  return { text, hadMarkup }
}

export const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** "11:41" or "1:02:09" to seconds; null for anything else. */
export function durationSeconds(d: unknown): number | null {
  if (typeof d !== 'string') return null
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(d.trim())
  if (!m) return null
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
}
