// Turns a URL an editor pastes into an iframe `src`, or refuses. Pure.
//
// An embed is a URL, never free HTML: a story body can show a video or an audio player without anyone being able
// to put a script or a form on the page. Known providers are recognised by their real hostname and rewritten to
// their canonical embed address (the pasted URL is never used as-is, so a look-alike host or a path trick cannot
// slip through). Any other public https site can be embedded too, in one of two ways:
//   auto  a vetted default list (below) plus the hosts an administrator approves in Site settings load straight away;
//   click every other host sits behind a click-to-load placeholder in a strict sandbox, so nothing from that site
//         loads until the reader chooses (no request, no cookie, nothing to track).
// What is never embedded: http, an address with a password, a private or internal host, or a page of this site.

export type EmbedProvider = 'youtube' | 'vimeo' | 'spotify' | 'apple-podcasts' | 'soundcloud' | 'x' | 'facebook' | 'custom'
/**
 * How the embed is shown: video is a 16:9 frame, audio is a short fixed-height player, wide is a 4:3 frame, and
 * link is no frame at all, a static card pointing at the original post. Posts on X and Facebook are link-only on
 * purpose: their live embeds load the platform's own script, which this site does not run (no third-party tracking).
 */
export type EmbedShape = 'video' | 'audio' | 'wide' | 'link'

/** `auto` loads with the page; `click` waits for the reader (a placeholder first). */
export type EmbedLoad = 'auto' | 'click'

export interface ResolvedEmbed {
  provider: EmbedProvider
  src: string
  shape: EmbedShape
  load: EmbedLoad
}

export type EmbedFailure = 'invalid_url' | 'not_https' | 'has_credentials' | 'private_host' | 'own_site' | 'unsupported_link'
export type EmbedResult = { ok: true; embed: ResolvedEmbed } | { ok: false; reason: EmbedFailure }

const YT_ID = /^[A-Za-z0-9_-]{11}$/
const VIMEO_ID = /^\d{5,12}$/
const VIMEO_HASH = /^[a-f0-9]{6,20}$/
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/
const SPOTIFY_KINDS = new Set(['episode', 'show', 'track', 'playlist', 'album', 'artist'])
const APPLE_PATH = /^\/([a-z]{2})\/podcast\/([a-z0-9-]+)\/id(\d{5,12})$/

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'])
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'])

function seconds(value: string | null): number | null {
  if (!value) return null
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
  if (m && (m[1] || m[2] || m[3])) return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
  return /^\d{1,6}$/.test(value) ? Number(value) : null
}

function youtube(url: URL): ResolvedEmbed | null {
  let id: string | null = null
  if (url.hostname === 'youtu.be') id = url.pathname.slice(1).split('/')[0] ?? null
  else if (YT_HOSTS.has(url.hostname)) {
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] === 'watch') id = url.searchParams.get('v')
    else if (parts[0] && ['embed', 'shorts', 'live'].includes(parts[0])) id = parts[1] ?? null
  } else return null
  if (!id || !YT_ID.test(id)) return null
  const start = seconds(url.searchParams.get('t') ?? url.searchParams.get('start'))
  return { provider: 'youtube', shape: 'video', load: 'auto', src: `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}` }
}

function vimeo(url: URL): ResolvedEmbed | null {
  if (!VIMEO_HOSTS.has(url.hostname)) return null
  const parts = url.pathname.split('/').filter(Boolean)
  const at = url.hostname === 'player.vimeo.com' ? (parts[0] === 'video' ? 1 : -1) : 0
  const id = at >= 0 ? parts[at] : undefined
  if (!id || !VIMEO_ID.test(id)) return null
  const hash = url.hostname === 'player.vimeo.com' ? url.searchParams.get('h') : parts[at + 1]
  const h = hash && VIMEO_HASH.test(hash) ? `?h=${hash}` : ''
  return { provider: 'vimeo', shape: 'video', load: 'auto', src: `https://player.vimeo.com/video/${id}${h}` }
}

function spotify(url: URL): ResolvedEmbed | null {
  if (url.hostname !== 'open.spotify.com') return null
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] === 'embed') parts.shift()
  const [kind, id] = parts
  if (!kind || !id || !SPOTIFY_KINDS.has(kind) || !SPOTIFY_ID.test(id)) return null
  return { provider: 'spotify', shape: 'audio', load: 'auto', src: `https://open.spotify.com/embed/${kind}/${id}` }
}

function applePodcasts(url: URL): ResolvedEmbed | null {
  if (url.hostname !== 'podcasts.apple.com' && url.hostname !== 'embed.podcasts.apple.com') return null
  const m = APPLE_PATH.exec(url.pathname)
  if (!m) return null
  const episode = url.searchParams.get('i')
  return {
    provider: 'apple-podcasts',
    shape: 'audio',
    load: 'auto',
    src: `https://embed.podcasts.apple.com/${m[1]}/podcast/${m[2]}/id${m[3]}${episode && /^\d{5,14}$/.test(episode) ? `?i=${episode}` : ''}`,
  }
}

function soundcloud(url: URL): ResolvedEmbed | null {
  if (url.hostname !== 'soundcloud.com' && url.hostname !== 'www.soundcloud.com') return null
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 1 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) return null
  const canonical = `https://soundcloud.com/${parts.join('/')}`
  return { provider: 'soundcloud', shape: 'audio', load: 'auto', src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(canonical)}` }
}

const X_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'])
const X_STATUS = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})\/?$/
const FB_HOSTS = new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com', 'fb.watch'])
const FB_SEGMENT = /^[A-Za-z0-9._-]{1,200}$/

/** A single post on X. Link-only: shown as a card pointing at the original, never as a live embed. */
function xPost(url: URL): ResolvedEmbed | null {
  if (!X_HOSTS.has(url.hostname)) return null
  const m = X_STATUS.exec(url.pathname)
  if (!m) return null
  return { provider: 'x', shape: 'link', load: 'auto', src: `https://x.com/${m[1]}/status/${m[2]}` }
}

/** A single post, video or share link on Facebook. Link-only, like X. The address is rebuilt, never passed through. */
function facebookPost(url: URL): ResolvedEmbed | null {
  if (!FB_HOSTS.has(url.hostname)) return null
  const parts = url.pathname.split('/').filter(Boolean)
  if (url.hostname === 'fb.watch') {
    return parts.length === 1 && FB_SEGMENT.test(parts[0]!) ? { provider: 'facebook', shape: 'link', load: 'auto', src: `https://fb.watch/${parts[0]}/` } : null
  }
  if (parts[0] === 'permalink.php') {
    const story = url.searchParams.get('story_fbid')
    const id = url.searchParams.get('id')
    return story && id && /^\d{5,25}$/.test(story) && /^\d{5,25}$/.test(id)
      ? { provider: 'facebook', shape: 'link', load: 'auto', src: `https://www.facebook.com/permalink.php?story_fbid=${story}&id=${id}` }
      : null
  }
  if (parts[0] === 'watch') {
    const v = url.searchParams.get('v')
    return v && /^\d{5,25}$/.test(v) ? { provider: 'facebook', shape: 'link', load: 'auto', src: `https://www.facebook.com/watch/?v=${v}` } : null
  }
  // /<page>/posts/<id>, /<page>/videos/<id>, /<page>/photos/<set>/<id>, /share/p/<code>, /share/v/<code>
  if (parts.length >= 2 && parts.length <= 5 && parts.every((p) => FB_SEGMENT.test(p))) {
    return { provider: 'facebook', shape: 'link', load: 'auto', src: `https://www.facebook.com/${parts.join('/')}` }
  }
  return null
}

/**
 * Sites that load straight away without anyone approving them: established tools public-media newsrooms embed. Vetted
 * only in the sense that each is a well-known provider of that kind of embed, not audited; administrators can add to
 * the list in Site settings. Everything else is still embeddable, behind a click.
 */
export const DEFAULT_EMBED_HOSTS: readonly string[] = [
  'embed.documentcloud.org', 'www.documentcloud.org',
  'datawrapper.dwcdn.net',
  'public.flourish.studio',
  'storymaps.arcgis.com', 'experience.arcgis.com', 'www.arcgis.com',
  'www.npr.org',
  'players.brightcove.net',
  'rumble.com',
  // The election-guide service WUWF has always embedded (script widgets, see lib/widgets.ts)
  'static.electup.com',
]

const OWN_HOSTS = new Set(['wuwf.org', 'www.wuwf.org'])
const INTERNAL_TLD = /\.(local|localhost|internal|lan|home|corp|intranet|test|invalid|example)$/i

/** A hostname on the public internet: not an address, not localhost, not an internal name. */
export function isPublicHost(host: string): boolean {
  const h = host.toLowerCase()
  if (!h.includes('.') || h.length > 253) return false
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':') || h.startsWith('[')) return false
  if (INTERNAL_TLD.test(h)) return false
  return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(h)
}

/**
 * @param approvedHosts hostnames an administrator approved in Site settings. Together with the built-in list they
 *   load without a click; matched exactly (a subdomain is not the same host), https only.
 */
export function resolveEmbed(input: string, approvedHosts: readonly string[] = []): EmbedResult {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return { ok: false, reason: 'invalid_url' }
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'not_https' }
  if (url.username || url.password) return { ok: false, reason: 'has_credentials' }

  const known = youtube(url) ?? vimeo(url) ?? spotify(url) ?? applePodcasts(url) ?? soundcloud(url) ?? xPost(url) ?? facebookPost(url)
  if (known) return { ok: true, embed: known }

  const host = url.hostname.toLowerCase()
  const isKnownHost =
    YT_HOSTS.has(host) || host === 'youtu.be' || VIMEO_HOSTS.has(host) || host === 'open.spotify.com' ||
    host.endsWith('podcasts.apple.com') || host.endsWith('soundcloud.com') || X_HOSTS.has(host) || FB_HOSTS.has(host)
  if (isKnownHost) return { ok: false, reason: 'unsupported_link' } // a provider's page that is not a playable item

  if (OWN_HOSTS.has(host)) return { ok: false, reason: 'own_site' }
  if (!isPublicHost(host)) return { ok: false, reason: 'private_host' }

  url.hash = ''
  const auto = DEFAULT_EMBED_HOSTS.includes(host) || approvedHosts.map((h) => h.trim().toLowerCase()).includes(host)
  return { ok: true, embed: { provider: 'custom', shape: 'wide', load: auto ? 'auto' : 'click', src: url.toString() } }
}

/** What an editor is told when a URL is refused. */
export const EMBED_FAILURE_MESSAGE: Record<EmbedFailure, string> = {
  invalid_url: 'That is not a valid URL.',
  not_https: 'Embeds must use https.',
  has_credentials: 'The URL must not contain a username or password.',
  private_host: 'That address is not on the public internet, so it cannot be embedded.',
  own_site: 'That is a page of this site. Link to it instead of embedding it.',
  unsupported_link: 'That link is not a playable item. Paste the address of a specific video, episode, track or post.',
}

/** Frame attributes for every embed: no top navigation, no forms, no downloads; a policy, not a suggestion. */
export const EMBED_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-presentation'
export const EMBED_REFERRER_POLICY = 'strict-origin-when-cross-origin'
export function embedAllow(shape: Exclude<EmbedShape, 'link'>): string {
  return shape === 'audio' ? 'encrypted-media' : 'fullscreen; picture-in-picture; encrypted-media'
}
