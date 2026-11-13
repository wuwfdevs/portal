import 'server-only'

import { cookies } from 'next/headers'

import { LISTENING_TABLE_SESSION_LENGTH, LISTENING_TABLE_TOKEN_LENGTH } from '@wuwf/portal-contracts'

import { AFTER_SESSION_COOKIE, TABLE_SESSION_COOKIE, cookieMaxAgeSeconds, isTableSessionToken } from './table-token'

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

/** The facilitator's after-page token, from the emailed link, if this browser holds one. */
export async function readAfterToken(): Promise<string | null> {
  const value = (await cookies()).get(AFTER_SESSION_COOKIE)?.value
  return isTableSessionToken(value) ? value : null
}

/**
 * What the after-page messages may be sent with, best first: the emailed link's token if this browser has one, then the table's own
 * session (a facilitator still on the phone that recorded). The Portal accepts either for those four messages and only the session for
 * the rest. A caller tries them in order, because a link that was replaced or has run out must not hide a session that still works.
 */
export async function readConversationSessions(): Promise<string[]> {
  const candidates = [await readAfterToken(), await readTableSession()]
  return candidates.filter((token, index): token is string => token !== null && candidates.indexOf(token) === index)
}

export const TABLE_TOKEN_LENGTHS = { link: LISTENING_TABLE_TOKEN_LENGTH, session: LISTENING_TABLE_SESSION_LENGTH } as const
