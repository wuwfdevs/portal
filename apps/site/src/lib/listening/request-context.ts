import 'server-only'

import { cookies, headers } from 'next/headers'

import { derivedSecret } from '@/lib/audience/secret'

import { VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE_SECONDS, clientAddressFrom, hashClientAddress, isVisitorId, newVisitorId, visitorSubject } from './visitor'

/**
 * The visitor for this request. With `create`, a visitor without a cookie is given one: only a server action or a route
 * handler may set a cookie, so only they pass it. A page that reads passes nothing and gets null for a stranger.
 */
export async function currentVisitorSubject(create: boolean) {
  const jar = await cookies()
  const existing = jar.get(VISITOR_COOKIE)?.value
  if (isVisitorId(existing)) return visitorSubject(existing)
  if (!create) return null

  const id = newVisitorId()
  const secure = (process.env.NEXT_PUBLIC_SERVER_URL ?? '').startsWith('https://') || process.env.VERCEL_ENV !== undefined
  jar.set(VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
  })
  return visitorSubject(id)
}

/**
 * The keyed, daily hash of this request's network address, for the Portal's rate limit. The Portal never receives the address.
 * Undefined when there is no address or no secret to key it with (the subject's own limit still applies).
 */
export async function currentClientHash(): Promise<string | undefined> {
  try {
    const address = clientAddressFrom(await headers())
    if (!address) return undefined
    return hashClientAddress(address, derivedSecret('listening-client-hash'))
  } catch {
    return undefined
  }
}
