import configPromise from '@payload-config'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { getPayload } from 'payload'

import { isLinkType, safeNext } from '@/lib/audience/rules'
import { NEXT_COOKIE, recordSignIn } from '@/lib/audience/sign-in'
import { supabaseAudienceAuth } from '@/lib/audience/supabase'

/**
 * Where an emailed sign-in link lands (`/account/confirm?token_hash=…&type=email`, built by the Supabase email template, ROADMAP →
 * Phase 7b). Exchanges the one-time token for a session, records the sign-in on the reader's profile, and goes on to where they
 * were headed (a path on this site only). A bad, used or expired link goes back to the sign-in page with a plain message.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash')
  const type = request.nextUrl.searchParams.get('type')
  const store = await cookies()
  const next = safeNext(store.get(NEXT_COOKIE)?.value)
  store.delete({ name: NEXT_COOKIE, path: '/account' })

  const fail = () => NextResponse.redirect(new URL('/account/sign-in?error=link', request.nextUrl.origin))
  if (!tokenHash || tokenHash.length > 512 || !isLinkType(type)) return fail()

  const user = await supabaseAudienceAuth.verifyLink(tokenHash, type)
  if (!user) return fail()
  const payload = await getPayload({ config: configPromise })
  await recordSignIn(payload, user, new Date()).catch((error: unknown) => {
    // The session is valid without the profile; it is made again at the next sign-in. Never log the reader's address.
    payload.logger.error(`Audience sign-in: the profile could not be saved: ${error instanceof Error ? error.message : 'unknown error'}`)
  })
  return NextResponse.redirect(new URL(next, request.nextUrl.origin))
}
