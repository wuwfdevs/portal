import { LISTENING_SECRET_MIN_LENGTH } from '@wuwf/portal-contracts'

/**
 * Where the Portal's listening API is and the secret that signs the calls to it. Pure: reads an env object and answers
 * with a value or null, so it can be tested without a server.
 *
 * `PORTAL_ORIGIN` is the Portal's address, scheme and host only (no path, no trailing slash): https in every hosted
 * environment, http only for localhost. `PORTAL_LISTENING_SECRET` is the listening channel's own secret, equal to the Portal's
 * `LISTENING_SIGNING_SECRET`, at least 32 characters. Either one missing or wrong means listening is "not set up on this
 * server yet", never an error page: the screens say so and nothing is sent.
 */
export interface ListeningConfig {
  origin: string
  secret: string
}

export function readListeningConfig(env: Record<string, string | undefined> = process.env): ListeningConfig | null {
  const secret = env.PORTAL_LISTENING_SECRET
  if (!secret || secret.length < LISTENING_SECRET_MIN_LENGTH) return null

  const rawOrigin = env.PORTAL_ORIGIN?.trim()
  if (!rawOrigin) return null
  let url: URL
  try {
    url = new URL(rawOrigin)
  } catch {
    return null
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null
  if (url.username || url.password) return null
  // An origin only: a path or query here would be signed into every request by accident.
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) return null

  return { origin: url.origin, secret }
}
