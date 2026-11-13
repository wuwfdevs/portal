import 'server-only'

import { cookies } from 'next/headers'

import { LISTENING_TABLE_SESSION_LENGTH, LISTENING_TABLE_TOKEN_LENGTH } from '@wuwf/portal-contracts'

import { TABLE_SESSION_COOKIE, cookieMaxAgeSeconds, isTableSessionToken } from './table-token'

export { isTableLinkToken, isTableSessionToken } from './table-token'

/**
 * The table session this phone holds, if any. The Portal hands the token back once, when the table's link is redeemed, and keeps
 * only its hash; this site holds it in an httpOnly cookie so the page's own script never sees it. Every later table call is made
 * by the site's server, which reads it here. The cookie is scoped to /listens and ends when the session does.
 */
export async function readTableSession(): Promise<string | null> {
  const value = (await cookies()).get(TABLE_SESSION_COOKIE)?.value
  return isTableSessionToken(value) ? value : null
}

/** Only a server action or a route handler may call this. */
export async function holdTableSession(token: string, expiresAt: string, now: Date = new Date()): Promise<void> {
  if (!isTableSessionToken(token)) return
  const secure = (process.env.NEXT_PUBLIC_SERVER_URL ?? '').startsWith('https://') || process.env.VERCEL_ENV !== undefined
  ;(await cookies()).set(TABLE_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/listens',
    maxAge: cookieMaxAgeSeconds(expiresAt, now),
  })
}

export async function dropTableSession(): Promise<void> {
  ;(await cookies()).delete({ name: TABLE_SESSION_COOKIE, path: '/listens' })
}

export const TABLE_TOKEN_LENGTHS = { link: LISTENING_TABLE_TOKEN_LENGTH, session: LISTENING_TABLE_SESSION_LENGTH } as const
