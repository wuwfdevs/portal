// A podcast feed (RSS 2.0 with iTunes tags), as pure functions. The route reads the records; this turns them into XML.
//
// Podcast apps identify an episode by its `guid`, never its address or file. A migrated episode's guid is the Grove contentId it
// already kept as `legacy.groveId`, so a subscriber who followed Grove's feed sees no new "episodes" when the feed moves here.

export interface FeedEpisode {
  title: string
  /** The episode's page. */
  url: string
  /** Grove's contentId for a migrated episode; a new episode has none and gets a guid made from its id. */
  groveId?: string | null
  id: string | number
  summary?: string | null
  publishedAt?: string | null
  audio: { url: string; mimeType?: string | null; bytes?: number | null; seconds?: number | null }
  /** Apple's season and episode numbers, and its episode type (full, trailer, bonus). */
  season?: number | null
  episode?: number | null
  episodeType?: 'full' | 'trailer' | 'bonus' | null
}

export interface FeedShow {
  title: string
  /** The show's page. */
  url: string
  /** The feed's own address. */
  feedUrl: string
  summary?: string | null
  authors: string[]
  imageUrl?: string | null
  language?: string
}

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g

/** Text for an XML element or attribute: control characters (illegal in XML) dropped, the five special ones escaped. */
export function xmlEscape(text: string): string {
  return text
    .replace(CONTROL, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** An RFC 822 date in GMT, as RSS wants, or null for a missing or unreadable date (a date is never invented). */
export function rfc822(value: string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toUTCString()
}

/** `H:MM:SS` for a length in seconds, or null when there is no usable length. */
export function itunesDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** The guid of an episode: Grove's contentId when it has one, else one made from the record id (never its address, which an editor may change). */
export function guidOf(e: Pick<FeedEpisode, 'groveId' | 'id'>): string {
  return e.groveId ? e.groveId : `wuwf-episode-${e.id}`
}

const tag = (name: string, value: string | null | undefined): string => (value ? `<${name}>${xmlEscape(value)}</${name}>` : '')

function itemXml(e: FeedEpisode): string {
  const date = rfc822(e.publishedAt)
  const duration = itunesDuration(e.audio.seconds)
  const bytes = e.audio.bytes && e.audio.bytes > 0 ? ` length="${Math.round(e.audio.bytes)}"` : ' length="0"'
  const type = e.audio.mimeType || 'audio/mpeg'
  return [
    '<item>',
    tag('title', e.title),
    tag('link', e.url),
    `<guid isPermaLink="false">${xmlEscape(guidOf(e))}</guid>`,
    tag('description', e.summary),
    date ? `<pubDate>${date}</pubDate>` : '',
    `<enclosure url="${xmlEscape(e.audio.url)}"${bytes} type="${xmlEscape(type)}"/>`,
    tag('itunes:duration', duration),
    e.season != null && Number.isInteger(e.season) ? `<itunes:season>${e.season}</itunes:season>` : '',
    e.episode != null && Number.isInteger(e.episode) ? `<itunes:episode>${e.episode}</itunes:episode>` : '',
    e.episodeType && e.episodeType !== 'full' ? `<itunes:episodeType>${e.episodeType}</itunes:episodeType>` : '',
    '</item>',
  ]
    .filter(Boolean)
    .join('')
}

/** The whole feed, episodes in the order given (newest first). An episode with no audio is not an episode of a podcast, so the caller leaves it out. */
export function buildFeed(show: FeedShow, episodes: readonly FeedEpisode[]): string {
  const author = show.authors.length > 0 ? show.authors.join(', ') : null
  const newest = episodes.map((e) => rfc822(e.publishedAt)).find((d): d is string => d !== null) ?? null
  const head = [
    tag('title', show.title),
    tag('link', show.url),
    tag('description', show.summary || show.title),
    tag('language', show.language ?? 'en-us'),
    `<atom:link href="${xmlEscape(show.feedUrl)}" rel="self" type="application/rss+xml"/>`,
    newest ? `<lastBuildDate>${newest}</lastBuildDate>` : '',
    tag('itunes:author', author),
    show.imageUrl ? `<itunes:image href="${xmlEscape(show.imageUrl)}"/>` : '',
    '<itunes:explicit>false</itunes:explicit>',
    '<itunes:type>episodic</itunes:type>',
  ]
    .filter(Boolean)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom"><channel>${head}${episodes.map(itemXml).join('')}</channel></rss>\n`
}
