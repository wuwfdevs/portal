import { LISTENING_SECRET_MIN_LENGTH } from '@wuwf/portal-contracts'

/**
 * Where the Portal's listening API is and the secret that signs the calls to it. Pure: reads an env object and answers
 * with a value or null, so it can be tested without a server.
 *
 * The Portal's address is its scheme and host only (no path, no trailing slash): https in every hosted environment, http only
 * for localhost. It is a site setting (Site settings > Portal address) and `PORTAL_ORIGIN` is the fallback when that is empty.
 * `PORTAL_LISTENING_SECRET` is the listening channel's own secret, equal to the Portal's `LISTENING_SIGNING_SECRET`, at least 32
 * characters, and stays an environment variable: a secret does not belong in a document the CMS stores and exports. Either one
 * missing or wrong means listening is "not set up on this server yet", never an error page: the screens say so and nothing is sent.
 */
export interface ListeningConfig {
  origin: string
  secret: string
}

/** The origin a raw address names, or null when it is not an origin we will sign requests to. */
export function parsePortalOrigin(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null
  if (url.username || url.password) return null
  // An origin only: a path or query here would be signed into every request by accident.
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) return null
  return url.origin
}

/** For the settings field: why this address cannot be used, or null when it can (or is empty, which means "use the server's"). */
export function portalOriginProblem(value: string | null | undefined): string | null {
  const text = value?.trim()
  if (!text) return null
  return parsePortalOrigin(text) ? null : 'Enter the Portal\'s address only, such as https://tools.example.org: https, no path, no login. (http is allowed only for localhost.)'
}

/**
 * `setting` is the Portal address from Site settings; when it has anything in it, it wins over the environment's `PORTAL_ORIGIN`.
 * A setting that is filled in but not a usable origin is not silently replaced by the variable: listening is off until it is fixed.
 */
export function readListeningConfig(
  env: Record<string, string | undefined> = process.env,
  setting?: string | null,
): ListeningConfig | null {
  const secret = env.PORTAL_LISTENING_SECRET
  if (!secret || secret.length < LISTENING_SECRET_MIN_LENGTH) return null

  const chosen = setting?.trim() || env.PORTAL_ORIGIN?.trim()
  if (!chosen) return null
  const origin = parsePortalOrigin(chosen)
  return origin ? { origin, secret } : null
}
