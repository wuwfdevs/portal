import { NextResponse } from 'next/server'

import { AFTER_SESSION_COOKIE, AFTER_SESSION_MAX_AGE_SECONDS, isTableSessionToken } from '@/lib/listening/table-token'

export const dynamic = 'force-dynamic'

/**
 * What the facilitator's emailed link opens. It keeps the token in an httpOnly cookie, so the page's own script never holds it and the
 * address in the browser no longer carries it, then sends the browser on to the after-page. Nothing is used up and nothing is sent to
 * the Portal here: a mail program that previews the link cannot spend it, and the Portal decides on the first real read whether the
 * token still works. A token of the wrong shape is a plain 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isTableSessionToken(token)) return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

  const secure = (process.env.NEXT_PUBLIC_SERVER_URL ?? '').startsWith('https://') || process.env.VERCEL_ENV !== undefined
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: '/listens/session/after',
      'Cache-Control': 'no-store',
      // The token is in this address: never hand it to another origin in a Referer header.
      'Referrer-Policy': 'no-referrer',
    },
  })
  response.cookies.set(AFTER_SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, path: '/listens', maxAge: AFTER_SESSION_MAX_AGE_SECONDS })
  return response
}
