import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import type { AudienceAuth, AudienceUser } from './auth'

/**
 * Supabase Auth on the site's own project (never the Portal's). Server only: the browser never talks to Supabase Auth directly,
 * so sessions live in httpOnly-capable cookies set by these server calls, and the proxy refreshes them on /account requests.
 *
 *   NEXT_PUBLIC_SUPABASE_URL              the project's URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  its publishable key (public by design)
 *
 * No service-role key: the site never needs one for sign-in. Supabase sends the sign-in email itself, through Resend's SMTP
 * (a project setting, ROADMAP → Phase 7b), using the email template that points at /account/confirm.
 */
export function supabaseAuthConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  return url && key ? { url, key } : null
}

async function client() {
  const config = supabaseAuthConfig()
  if (!config) return null
  const store = await cookies()
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => {
        // A server component cannot set cookies (only a server action or route handler can); the proxy refreshes them instead.
        try {
          for (const { name, value, options } of items) store.set(name, value, options)
        } catch {
          // ignored: read-only context
        }
      },
    },
  })
}

const toUser = (u: { id: string; email?: string | null } | null | undefined): AudienceUser | null => (u ? { id: u.id, email: u.email ?? null } : null)

export const supabaseAudienceAuth: AudienceAuth = {
  async sendSignInLink(email, redirectTo) {
    const sb = await client()
    if (!sb) return { ok: false, reason: 'not-configured' }
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: redirectTo } })
    if (!error) return { ok: true }
    // Supabase answers 429 when the same address asked within the last minute, or the project's hourly email cap is reached.
    if (error.status === 429) return { ok: false, reason: 'too-soon' }
    console.error('Audience sign-in: Supabase refused to send a link', error.status, error.code)
    return { ok: false, reason: 'failed' }
  },
  async verifyLink(tokenHash, type) {
    const sb = await client()
    if (!sb) return null
    const { data, error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type })
    return error ? null : toUser(data.user)
  },
  async currentUser() {
    const sb = await client()
    if (!sb) return null
    const { data, error } = await sb.auth.getUser()
    return error ? null : toUser(data.user)
  },
  async signOut() {
    const sb = await client()
    if (sb) await sb.auth.signOut()
  },
}
