import type { LinkType } from './rules'

/** The reader signed in on this site. Only what the site needs; the email address stays in Supabase Auth. */
export interface AudienceUser {
  /** Supabase Auth's user id: the key of the audience profile. */
  id: string
  email: string | null
}

export type SendLinkResult = { ok: true } | { ok: false; reason: 'not-configured' | 'too-soon' | 'failed' }

/**
 * Audience authentication, behind an interface so the provider can be replaced and the flows tested without it (CLAUDE.md:
 * third-party integrations sit behind interfaces). The Supabase implementation is `./supabase.ts`.
 */
export interface AudienceAuth {
  /** Emails a one-time sign-in link; the address gets an account the first time. */
  sendSignInLink(email: string, redirectTo: string): Promise<SendLinkResult>
  /** Turns the link's token into a session (cookies). Null when the link is invalid, used or expired. */
  verifyLink(tokenHash: string, type: LinkType): Promise<AudienceUser | null>
  /** The signed-in reader, checked with Supabase Auth (never trusted from the cookie alone), or null. */
  currentUser(): Promise<AudienceUser | null>
  signOut(): Promise<void>
}
