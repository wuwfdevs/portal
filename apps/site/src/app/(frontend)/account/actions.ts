'use server'

import configPromise from '@payload-config'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { clientAddress } from '@/lib/events/abuse'
import { siteOrigin } from '@/lib/audience/origin'
import { HONEYPOT } from '@/lib/audience/fields'
import { safeNext } from '@/lib/audience/rules'
import { NEXT_COOKIE, requestSignIn } from '@/lib/audience/sign-in'
import { supabaseAudienceAuth } from '@/lib/audience/supabase'
import { derivedSecret } from '@/lib/audience/secret'
import { claimMembership } from '@/lib/members/claim'

export interface SignInState {
  status: 'idle' | 'sent' | 'error'
  message?: string
  email?: string
}

/** Asks for a sign-in link. The message never says whether the address already has an account. */
export async function askForSignInLink(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = formData.get('email')
  const typed = typeof email === 'string' ? email.slice(0, 254) : ''
  const h = await headers()
  const payload = await getPayload({ config: configPromise })
  const outcome = await requestSignIn(
    payload,
    supabaseAudienceAuth,
    { email: typed, honeypot: formData.get(HONEYPOT), address: clientAddress(h.get('x-forwarded-for')), origin: siteOrigin(), now: new Date() },
    derivedSecret('audience-sign-in-client'),
  ).catch((error: unknown) => {
    // Never log the address someone typed.
    payload.logger.error(`Audience sign-in request failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    return null
  })

  switch (outcome?.kind) {
    case 'sent': {
      const store = await cookies()
      store.set(NEXT_COOKIE, safeNext(formData.get('next')), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/account', maxAge: 3600 })
      return { status: 'sent', email: typed.trim() }
    }
    case 'invalid-email':
      return { status: 'error', message: 'That does not look like an email address. Please check it and try again.', email: typed }
    case 'limited':
      return {
        status: 'error',
        message:
          outcome.retryAfter === 'minute'
            ? 'A link was sent to that address in the last minute. Please check your inbox, or wait a minute and ask again.'
            : `Several links have been asked for from here recently. Please try again ${outcome.retryAfter === 'hour' ? 'in an hour' : 'tomorrow'}.`,
        email: typed,
      }
    default:
      return { status: 'error', message: 'Signing in is not available right now. Please try again later.', email: typed }
  }
}

export async function signOut(): Promise<void> {
  await supabaseAudienceAuth.signOut()
  redirect('/')
}

/** Connects a membership to the signed-in reader's account from a claim link (phase 7c). */
export async function connectMembership(formData: FormData): Promise<void> {
  const token = formData.get('token')
  const user = await supabaseAudienceAuth.currentUser()
  const back = `/account/claim?token=${encodeURIComponent(typeof token === 'string' ? token : '')}`
  if (!user) redirect(`/account/sign-in?next=${encodeURIComponent(back)}`)
  const payload = await getPayload({ config: configPromise })
  const result = await claimMembership(payload, token, user, new Date()).catch((error: unknown) => {
    payload.logger.error(`Membership claim failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    return null
  })
  if (result?.kind === 'ok') redirect('/account?connected=1')
  redirect(result ? back : `${back}&error=failed`)
}
