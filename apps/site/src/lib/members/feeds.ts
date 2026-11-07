// Private member feeds (phase 7d; board 25). Pure: no Payload, no Next.
//
// Podcast apps cannot sign in: they fetch a feed address on a schedule with no cookies. So each member gets, for each show, a
// private address that carries a signed token. The token names the reader's profile and a version, and its signature binds both
// to the show; nothing secret is stored, so the account page can always show the address again. "Reset" raises the version, and
// every address made before stops working. The membership is checked on every fetch, so a lapsed membership closes the feed too.

import { createHmac, timingSafeEqual } from 'node:crypto'

export interface FeedTokenParts {
  profileId: number
  version: number
}

const sign = (profileId: number, productionId: string | number, version: number, secret: string): string =>
  createHmac('sha256', secret).update(`member-feed:${profileId}:${productionId}:${version}`).digest('base64url').slice(0, 32)

/** `<profile>-<version>-<signature>`: what goes in the feed address, before `.xml`. */
export function makeFeedToken(profileId: number, productionId: string | number, version: number, secret: string): string {
  return `${profileId}-${version}-${sign(profileId, productionId, version, secret)}`
}

/** The token's parts when it is well formed and its signature is right for this show; null otherwise. */
export function verifyFeedToken(token: string, productionId: string | number, secret: string): (FeedTokenParts & { signature: string }) | null {
  const m = /^(\d{1,12})-(\d{1,6})-([A-Za-z0-9_-]{32})$/.exec(token)
  if (!m) return null
  const profileId = Number(m[1])
  const version = Number(m[2])
  const want = Buffer.from(sign(profileId, productionId, version, secret))
  const got = Buffer.from(m[3]!)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  return { profileId, version, signature: m[3]! }
}

/** `/feeds/<show>/<token>.xml`. */
export const memberFeedPath = (showSlug: string, token: string): string => `/feeds/${showSlug}/${token}.xml`

/** A members-only episode's audio inside a member's feed: checked against the same token on every play. */
export const memberFeedAudioPath = (showSlug: string, token: string, audioId: string | number): string => `/feeds/${showSlug}/${token}/audio/${audioId}`

/**
 * Buttons that add a feed to a podcast app. Apple Podcasts, Overcast and Pocket Casts take a private feed address; Spotify does not
 * take private feeds at all, so it is not offered (board 25 showed it; it would not work).
 */
export function podcastAppLinks(feedUrl: string): { app: string; href: string }[] {
  const bare = feedUrl.replace(/^https?:\/\//, '')
  return [
    { app: 'Apple Podcasts', href: `podcast://${bare}` },
    { app: 'Overcast', href: `overcast://x-callback-url/add?url=${encodeURIComponent(feedUrl)}` },
    { app: 'Pocket Casts', href: `pktc://subscribe/${bare}` },
  ]
}
