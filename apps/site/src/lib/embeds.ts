// Turns a URL an editor pastes into an iframe `src`, or refuses. Pure.
//
// An embed is a URL plus an allowlist, never free HTML: a story body can show a video or an audio player without
// anyone being able to put a script, a form or an arbitrary frame on the page. Known providers are recognised by
// their real hostname and rewritten to their canonical embed address (the pasted URL is never used as-is, so a
// look-alike host or a path trick cannot slip through). Anything else must be on the administrator-approved host
// list in Site settings, and must be https.

export type EmbedProvider = 'youtube' | 'vimeo' | 'spotify' | 'apple-podcasts' | 'soundcloud' | 'custom'
/** How the frame is sized: video is 16:9, audio is a short fixed-height player, wide is 4:3. */
export type EmbedShape = 'video' | 'audio' | 'wide'

export interface ResolvedEmbed {
  provider: EmbedProvider
  src: string
  shape: EmbedShape
}

export type EmbedFailure = 'invalid_url' | 'not_https' | 'has_credentials' | 'host_not_allowed' | 'unsupported_link'
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
  return { provider: 'youtube', shape: 'video', src: `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}` }
}

function vimeo(url: URL): ResolvedEmbed | null {
  if (!VIMEO_HOSTS.has(url.hostname)) return null
  const parts = url.pathname.split('/').filter(Boolean)
  const at = url.hostname === 'player.vimeo.com' ? (parts[0] === 'video' ? 1 : -1) : 0
  const id = at >= 0 ? parts[at] : undefined
  if (!id || !VIMEO_ID.test(id)) return null
  const hash = url.hostname === 'player.vimeo.com' ? url.searchParams.get('h') : parts[at + 1]
  const h = hash && VIMEO_HASH.test(hash) ? `?h=${hash}` : ''
  return { provider: 'vimeo', shape: 'video', src: `https://player.vimeo.com/video/${id}${h}` }
}

function spotify(url: URL): ResolvedEmbed | null {
  if (url.hostname !== 'open.spotify.com') return null
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] === 'embed') parts.shift()
  const [kind, id] = parts
  if (!kind || !id || !SPOTIFY_KINDS.has(kind) || !SPOTIFY_ID.test(id)) return null
  return { provider: 'spotify', shape: 'audio', src: `https://open.spotify.com/embed/${kind}/${id}` }
}

function applePodcasts(url: URL): ResolvedEmbed | null {
  if (url.hostname !== 'podcasts.apple.com' && url.hostname !== 'embed.podcasts.apple.com') return null
  const m = APPLE_PATH.exec(url.pathname)
  if (!m) return null
  const episode = url.searchParams.get('i')
  return {
    provider: 'apple-podcasts',
    shape: 'audio',
    src: `https://embed.podcasts.apple.com/${m[1]}/podcast/${m[2]}/id${m[3]}${episode && /^\d{5,14}$/.test(episode) ? `?i=${episode}` : ''}`,
  }
}

function soundcloud(url: URL): ResolvedEmbed | null {
  if (url.hostname !== 'soundcloud.com' && url.hostname !== 'www.soundcloud.com') return null
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 1 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) return null
  const canonical = `https://soundcloud.com/${parts.join('/')}`
  return { provider: 'soundcloud', shape: 'audio', src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(canonical)}` }
}

/**
 * @param allowedHosts hostnames an administrator approved in Site settings for frames that are not one of the known
 *   providers. Matched exactly (a subdomain is not the same host), https only.
 */
export function resolveEmbed(input: string, allowedHosts: readonly string[] = []): EmbedResult {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return { ok: false, reason: 'invalid_url' }
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'not_https' }
  if (url.username || url.password) return { ok: false, reason: 'has_credentials' }

  const known = youtube(url) ?? vimeo(url) ?? spotify(url) ?? applePodcasts(url) ?? soundcloud(url)
  if (known) return { ok: true, embed: known }

  const host = url.hostname.toLowerCase()
  const isKnownHost =
    YT_HOSTS.has(host) || host === 'youtu.be' || VIMEO_HOSTS.has(host) || host === 'open.spotify.com' ||
    host.endsWith('podcasts.apple.com') || host.endsWith('soundcloud.com')
  if (isKnownHost) return { ok: false, reason: 'unsupported_link' } // a provider's page that is not a playable item

  if (allowedHosts.map((h) => h.trim().toLowerCase()).includes(host)) {
    url.hash = ''
    return { ok: true, embed: { provider: 'custom', shape: 'wide', src: url.toString() } }
  }
  return { ok: false, reason: 'host_not_allowed' }
}

/** What an editor is told when a URL is refused. */
export const EMBED_FAILURE_MESSAGE: Record<EmbedFailure, string> = {
  invalid_url: 'That is not a valid URL.',
  not_https: 'Embeds must use https.',
  has_credentials: 'The URL must not contain a username or password.',
  host_not_allowed: 'That site is not on the approved list. An administrator can add it in Site settings.',
  unsupported_link: 'That link is not a playable item. Paste the address of a specific video, episode or track.',
}

/** Frame attributes for every embed: no top navigation, no forms, no downloads; a policy, not a suggestion. */
export const EMBED_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-presentation'
export const EMBED_REFERRER_POLICY = 'strict-origin-when-cross-origin'
export function embedAllow(shape: EmbedShape): string {
  return shape === 'audio' ? 'encrypted-media' : 'fullscreen; picture-in-picture; encrypted-media'
}
