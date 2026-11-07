// URL paths. Pure: no Payload, no Next. (Grove migration, ROADMAP → *URL scheme (decided)*.)
//
// Every public record has one unique `path`. A migrated record copies Grove's path verbatim and it is never
// recomputed. A new story gets `/{section}/{YYYY-MM-DD}/{slug}` once, at its first publish. The path is stored
// decoded; one catch-all route turns the request's segments back into it.

/** The station's local time. Grove's own time zone for the date in a path is checked by the census (path date vs published date). */
export const STATION_TIME_ZONE = 'America/Chicago'

export const MAX_PATH_LENGTH = 512

/** The first segment of a request that a route, file or plugin already owns. A record may not take a path under one. */
export const RESERVED_FIRST_SEGMENTS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'next',
  '_next',
  '_draft',
  'posts',
  'search',
  'support',
  'live-updates',
  'podcasts',
  'video',
  'radiolive',
  'account',
  'feeds',
  'fellowships',
  'series',
  'productions',
  'favicon.ico',
  'favicon.svg',
  'robots.txt',
  'sitemap.xml',
  'sitemaps',
  'ie-incompatible.html',
])

export type PathCheck = { ok: true } | { ok: false; reason: string }

const FORBIDDEN_CHARS = /[\u0000- \u007f?#\\%]/

export function isReservedPath(path: string): boolean {
  const first = path.split('/').filter(Boolean)[0] ?? ''
  return RESERVED_FIRST_SEGMENTS.has(first) || /-sitemap\.xml$/.test(first)
}

/** The address of a live blog. It lives under `/live-updates`, a first segment that is otherwise reserved for the site's own routes. */
export const LIVE_FIRST_SEGMENT = 'live-updates'
export const livePath = (slug: string): string => `/${LIVE_FIRST_SEGMENT}/${slug}`

/**
 * Whether a stored path is acceptable. Lenient about letters (Grove's paths are kept as they are), strict about shape.
 * `allowFirstSegment` lets one reserved first segment through, for the one kind of record that is meant to live under it (a live blog).
 */
export function checkPath(path: unknown, opts: { allowFirstSegment?: string } = {}): PathCheck {
  if (typeof path !== 'string' || path === '') return { ok: false, reason: 'A path is required.' }
  if (!path.startsWith('/')) return { ok: false, reason: 'A path starts with "/".' }
  if (path === '/') return { ok: false, reason: 'The home page is served at "/" and has no path of its own.' }
  if (path.length > MAX_PATH_LENGTH) return { ok: false, reason: `A path is at most ${MAX_PATH_LENGTH} characters.` }
  if (path.endsWith('/')) return { ok: false, reason: 'A path has no trailing slash.' }
  if (FORBIDDEN_CHARS.test(path)) return { ok: false, reason: 'A path has no spaces, control characters, "?", "#", "\\" or "%".' }
  const segments = path.slice(1).split('/')
  if (segments.some((s) => s === '')) return { ok: false, reason: 'A path has no empty segment ("//").' }
  if (segments.some((s) => s === '.' || s === '..')) return { ok: false, reason: 'A path has no "." or ".." segment.' }
  if (isReservedPath(path) && !(opts.allowFirstSegment && segments[0] === opts.allowFirstSegment)) return { ok: false, reason: `"/${segments[0]}" belongs to the site itself.` }
  return { ok: true }
}

/**
 * The stored path for a request's catch-all segments (as Next hands them over: still percent-encoded), or null if the
 * request cannot be a path at all. Never throws on hostile input.
 */
export function pathFromSegments(segments: readonly string[] | undefined): string | null {
  if (!segments || segments.length === 0) return null
  const decoded: string[] = []
  for (const raw of segments) {
    let s: string
    try {
      s = decodeURIComponent(raw)
    } catch {
      return null
    }
    if (s === '' || s === '.' || s === '..' || s.includes('/')) return null
    decoded.push(s)
  }
  const path = '/' + decoded.join('/')
  return checkPathShape(path) ? path : null
}

/** The shape rules of `checkPath` without the reserved list (a request for a reserved path is simply not found). */
function checkPathShape(path: string): boolean {
  return path.length <= MAX_PATH_LENGTH && !FORBIDDEN_CHARS.test(path)
}

/** `YYYY-MM-DD` of an instant in a time zone. */
export function localDate(when: string | Date, timeZone: string = STATION_TIME_ZONE): string {
  const d = typeof when === 'string' ? new Date(when) : when
  if (Number.isNaN(d.getTime())) throw new Error(`Not a date: ${String(when)}`)
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** A new story's path. Used once, at first publish; the result is stored and never recomputed. */
export function storyPath(input: { section: string; publishedAt: string | Date; slug: string; timeZone?: string }): string {
  return `/${input.section}/${localDate(input.publishedAt, input.timeZone)}/${input.slug}`
}

/** A new standalone page's path. */
export const pagePath = (slug: string): string => `/${slug}`

/** A section's slug must be a safe, lowercase path segment. */
export const SECTION_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** The draft-only address of a record that has no path yet (reachable only with the preview cookie). */
export const draftPreviewPath = (collection: 'posts' | 'pages', id: string | number): string => `/_draft/${collection}/${id}`
