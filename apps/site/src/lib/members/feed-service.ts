import type { Payload } from 'payload'

import type { Audio, Contributor, Media, Post, Production } from '@/payload-types'

import { buildFeed, type FeedEpisode } from '../shows/feed'
import { hasMembersListening } from './claim'
import { deliverMemberFile, PRIVATE_HEADERS } from './deliver'
import { makeFeedToken, memberFeedAudioPath, memberFeedPath, verifyFeedToken } from './feeds'

const named = <T extends object>(v: T | string | number | null | undefined): T | null => (v && typeof v === 'object' ? v : null)
const MAX_EPISODES = 500

/** The current version of a member's feed for a show (1 until they reset it). */
async function feedVersion(payload: Payload, profileId: number, productionId: string | number): Promise<{ id: string | number | null; version: number }> {
  const row = (await payload.find({ collection: 'member-feeds', where: { and: [{ account: { equals: profileId } }, { production: { equals: productionId } }] }, limit: 1, depth: 0, overrideAccess: true, pagination: false })).docs[0]
  return row ? { id: row.id, version: row.version } : { id: null, version: 1 }
}

/** Shows that have a members' feed: listed WUWF originals with at least one published members-only episode. */
export async function memberFeedShows(payload: Payload): Promise<Pick<Production, 'id' | 'title' | 'slug' | 'path' | 'tagline'>[]> {
  const shows = await payload.find({ collection: 'productions', where: { and: [{ listed: { equals: true } }, { kind: { equals: 'original' } }] }, depth: 0, limit: 100, overrideAccess: true, pagination: false, sort: 'title', select: { title: true, slug: true, path: true, tagline: true } })
  const withMembers = await Promise.all(
    shows.docs.map(async (s) => {
      const n = await payload.count({ collection: 'posts', overrideAccess: true, where: { and: [{ production: { equals: s.id } }, { format: { equals: 'audio' } }, { membersOnly: { equals: true } }, { _status: { equals: 'published' } }] } })
      return n.totalDocs > 0 ? s : null
    }),
  )
  return withMembers.filter((s): s is NonNullable<typeof s> => s !== null && Boolean(s.slug))
}

/** A member's private feed addresses, one per show that has one (board 25). */
export async function memberFeedsFor(payload: Payload, profileId: number, origin: string, secret: string) {
  const shows = await memberFeedShows(payload)
  return Promise.all(
    shows.map(async (show) => {
      const { version } = await feedVersion(payload, profileId, show.id)
      return { show, url: new URL(memberFeedPath(show.slug!, makeFeedToken(profileId, show.id, version, secret)), origin).toString() }
    }),
  )
}

/** Stops every earlier address of this member's feed for a show; the account page then shows the new one. */
export async function resetMemberFeed(payload: Payload, profileId: number, productionId: string | number): Promise<number> {
  const current = await feedVersion(payload, profileId, productionId)
  const version = current.version + 1
  if (current.id === null) await payload.create({ collection: 'member-feeds', data: { account: profileId, production: productionId as number, version }, overrideAccess: true, context: { disableRevalidate: true } })
  else await payload.update({ collection: 'member-feeds', id: current.id, data: { version }, overrideAccess: true, context: { disableRevalidate: true } })
  return version
}

type Resolved = { show: Production; token: string; profileId: number; supabaseUserId: string } | { status: 404 | 410 }

/** The show and member a feed address belongs to, when its token is valid and current. A reset or unknown address is 410 Gone. */
async function resolve(payload: Payload, slug: string, token: string, secret: string): Promise<Resolved> {
  const show = (await payload.find({ collection: 'productions', where: { and: [{ slug: { equals: slug } }, { kind: { equals: 'original' } }] }, limit: 1, depth: 1, overrideAccess: true })).docs[0]
  if (!show) return { status: 404 }
  const parts = verifyFeedToken(token, show.id, secret)
  if (!parts) return { status: 410 }
  const [{ version }, profile] = await Promise.all([
    feedVersion(payload, parts.profileId, show.id),
    payload.findByID({ collection: 'audience-profiles', id: parts.profileId, depth: 0, overrideAccess: true, disableErrors: true }),
  ])
  if (!profile || version !== parts.version) return { status: 410 }
  return { show, token, profileId: parts.profileId, supabaseUserId: profile.supabaseUserId }
}

/**
 * A member's private feed (`/feeds/<show>/<token>.xml`): every published episode of the show, members-only ones included, their
 * audio through the member's own checked address. If the membership has lapsed, the feed carries only the free episodes, so the
 * app keeps working and nothing members-only leaks.
 */
export async function memberFeedResponse(payload: Payload, slug: string, token: string, origin: string, secret: string, now: Date): Promise<Response> {
  const r = await resolve(payload, slug, token, secret)
  if ('status' in r) return new Response(r.status === 410 ? 'This feed address has been replaced or is not valid.' : 'Not found', { status: r.status, headers: PRIVATE_HEADERS })
  const member = await hasMembersListening(payload, r.supabaseUserId, now)

  const posts = await payload.find({
    collection: 'posts',
    depth: 1,
    draft: false,
    limit: MAX_EPISODES,
    overrideAccess: true,
    pagination: false,
    sort: '-publishedAt',
    select: { title: true, dek: true, path: true, publishedAt: true, featuredAudio: true, membersOnly: true, legacy: { groveId: true }, season: true, episodeNumber: true, episodeType: true },
    where: { and: [{ production: { equals: r.show.id } }, { format: { equals: 'audio' } }, { _status: { equals: 'published' } }, ...(member ? [] : [{ membersOnly: { equals: false } }])] },
  })
  const episodes = (posts.docs as Post[]).flatMap((p): FeedEpisode[] => {
    const audio = named<Audio>(p.featuredAudio as never)
    if (!audio?.url || !p.path) return []
    const audioUrl = p.membersOnly ? new URL(memberFeedAudioPath(slug, r.token, audio.id), origin).toString() : audio.url.startsWith('http') ? audio.url : `${origin}${audio.url}`
    return [
      {
        id: p.id,
        title: p.title,
        url: `${origin}${p.path}`,
        groveId: p.legacy?.groveId,
        summary: p.dek,
        publishedAt: p.publishedAt,
        audio: { url: audioUrl, mimeType: audio.mimeType, bytes: audio.filesize, seconds: audio.durationSeconds },
        season: named<{ number: number }>(p.season as never)?.number ?? null,
        episode: p.episodeNumber ?? null,
        episodeType: p.episodeType ?? null,
      },
    ]
  })
  const hero = named<Media>(r.show.heroImage)
  const hosts = (r.show.hosts ?? []).map((h) => named<Contributor>(h)?.name).filter((n): n is string => Boolean(n))
  const xml = buildFeed(
    {
      title: `${r.show.title} (WUWF members)`,
      url: `${origin}${r.show.path ?? '/podcasts'}`,
      feedUrl: new URL(memberFeedPath(slug, r.token), origin).toString(),
      summary: member
        ? `${r.show.summary ?? r.show.tagline ?? r.show.title} This is your private WUWF members' feed: please do not share it.`
        : `${r.show.summary ?? r.show.tagline ?? r.show.title} Your WUWF membership has ended, so this feed has only the free episodes. Renew to hear the rest.`,
      authors: hosts.length > 0 ? hosts : ['WUWF Public Media'],
      imageUrl: hero?.url ? (hero.url.startsWith('http') ? hero.url : `${origin}${hero.url}`) : null,
    },
    episodes,
  )
  // A private feed is never cached by anyone but the app, and asks search engines and directories to leave it alone.
  return new Response(xml, { headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/rss+xml; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' } })
}

/** A members-only episode's audio from a member's feed: the same token, the membership and the episode are checked on every play. */
export async function memberFeedAudioResponse(payload: Payload, slug: string, token: string, audioId: string, secret: string, now: Date): Promise<Response> {
  if (!/^\d{1,12}$/.test(audioId)) return new Response('Not found', { status: 404, headers: PRIVATE_HEADERS })
  const r = await resolve(payload, slug, token, secret)
  if ('status' in r) return new Response('Not found', { status: r.status, headers: PRIVATE_HEADERS })
  if (!(await hasMembersListening(payload, r.supabaseUserId, now))) return new Response('Your WUWF membership has ended.', { status: 403, headers: PRIVATE_HEADERS })
  // Only audio that is the featured audio of a published members-only episode of this show.
  const episode = await payload.count({ collection: 'posts', overrideAccess: true, where: { and: [{ production: { equals: r.show.id } }, { featuredAudio: { equals: audioId } }, { membersOnly: { equals: true } }, { _status: { equals: 'published' } }] } })
  if (episode.totalDocs === 0) return new Response('Not found', { status: 404, headers: PRIVATE_HEADERS })
  const audio = await payload.findByID({ collection: 'audio', id: audioId, depth: 0, overrideAccess: true, disableErrors: true })
  if (!audio) return new Response('Not found', { status: 404, headers: PRIVATE_HEADERS })
  return deliverMemberFile('audio', audio)
}
