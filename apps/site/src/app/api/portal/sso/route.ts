import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { signInFromPortal } from '@/lib/portal/sign-in'

/**
 * The browser lands here from the Portal's Website tool with a short-lived signed token. All the work is in
 * lib/portal/sign-in.ts; this only translates it to a response. The token is consumed and the browser is
 * redirected on, so the token never sits in the URL of a page the person stays on.
 */
export async function GET(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const url = new URL(request.url)
  const result = await signInFromPortal({
    payload,
    token: url.searchParams.get('token'),
    identitySecret: process.env.PORTAL_IDENTITY_SECRET,
    secureCookie: url.protocol === 'https:' || (process.env.NEXT_PUBLIC_SERVER_URL ?? '').startsWith('https://'),
  })

  const headers = new Headers({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
  if (!result.ok) {
    headers.set('Content-Type', 'text/plain; charset=utf-8')
    return new Response(result.message, { status: result.status, headers })
  }
  headers.set('Set-Cookie', result.cookie)
  headers.set('Location', new URL(result.redirectTo, url).toString())
  return new Response(null, { status: 303, headers })
}
