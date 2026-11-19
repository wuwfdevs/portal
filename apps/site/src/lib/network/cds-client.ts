import type { CdsReader } from './sync'

/**
 * The one place the site talks to NPR's Content Distribution Service. Server only: the key is a secret and never reaches a browser.
 *
 * The site has **its own CDS key** (a key is tied to one client; the Portal's is the Portal's). `NPR_CDS_TOKEN` unset means "not set up":
 * every caller treats that as a state, not an error, and nothing is fetched.
 */

export const DEFAULT_CDS_BASE = 'https://content.api.npr.org/v1'

export type FetchLike = (url: string, init: { headers: Record<string, string>; cache: 'no-store'; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

/** A reader for one key and base address. The base must be https; anything else would send the key in the clear. */
export function cdsReader(token: string, base: string = DEFAULT_CDS_BASE, fetchImpl: FetchLike = fetch as unknown as FetchLike): CdsReader {
  const root = base.replace(/\/+$/, '')
  if (!root.startsWith('https://')) throw new Error('The NPR CDS address must start with https://.')
  return {
    async get(query) {
      const res = await fetchImpl(`${root}/documents?${query}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      })
      // The status only: a response body from CDS is never put in an error, a log or a screen.
      if (!res.ok) throw new Error(`NPR CDS returned an error (${res.status}).`)
      return res.json()
    },
  }
}

type Env = Record<string, string | undefined>

/** Whether the site has a CDS key. */
export function cdsConfigured(env: Env = process.env): boolean {
  return Boolean(env.NPR_CDS_TOKEN?.trim())
}

/** The reader the site uses, or null when no key is set. */
export function cdsReaderFromEnv(env: Env = process.env): CdsReader | null {
  const token = env.NPR_CDS_TOKEN?.trim()
  if (!token) return null
  return cdsReader(token, env.NPR_CDS_API_BASE?.trim() || DEFAULT_CDS_BASE)
}
