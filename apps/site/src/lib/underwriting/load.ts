// Maps populated Payload documents onto the resolver's inputs, and loads them. Keeping the mapping
// here (pure, tested) means resolve.ts never sees a Payload shape, and a relationship that was not
// populated is treated as "not there" rather than crashing a page.

import type { Payload } from 'payload'

import type { Post } from '@/payload-types'
import type {
  Agreement, CollectionKind, CollectionRef, ContentFormat, ContentRef, Placement, Resolution,
} from './resolve'
import { resolveUnderwriting } from './resolve'

type Rel<T> = T | string | number | null | undefined
const populated = <T extends object>(v: Rel<T>): T | null => (v && typeof v === 'object' ? (v as T) : null)

export interface AgreementDoc {
  id: string | number
  sponsor?: Rel<{ id: string | number; name: string; url?: string | null; logo?: Rel<{ id: string | number }> }>
  text: string
  shortText?: string | null
  textVersion?: number | null
  kind?: 'recognition' | 'campaign' | null
  startsOn?: string | null
  endsOn?: string | null
  active?: boolean | null
  formats?: ('web' | 'audio' | 'video')[] | null
  placements?: Placement[] | null
}

/** The calendar day of a Payload date value (stored as an ISO timestamp). */
export function dayString(value: string | null | undefined): string | null {
  if (!value) return null
  const day = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

/** An agreement whose sponsor or start date is missing cannot acknowledge anyone, so it maps to null. */
export function toAgreement(doc: Rel<AgreementDoc>): Agreement | null {
  const a = populated<AgreementDoc>(doc)
  if (!a) return null
  const sponsor = populated(a.sponsor)
  const startsOn = dayString(a.startsOn)
  if (!sponsor || !startsOn || !a.text) return null
  const logo = populated(sponsor.logo)
  return {
    id: String(a.id),
    sponsorId: String(sponsor.id),
    sponsorName: sponsor.name,
    text: a.text,
    ...(a.shortText ? { shortText: a.shortText } : {}),
    textVersion: a.textVersion ?? 1,
    kind: a.kind ?? 'recognition',
    startsOn,
    endsOn: dayString(a.endsOn),
    active: a.active !== false,
    formats: a.formats ?? [],
    placements: a.placements ?? [],
    ...(logo ? { logoMediaId: String(logo.id) } : {}),
    ...(sponsor.url ? { url: sponsor.url } : {}),
  }
}

interface CollectionDoc {
  id: string | number
  slug?: string | null
  title: string
  agreements?: Rel<AgreementDoc>[] | null
}

export function toCollectionRef(kind: CollectionKind, doc: Rel<CollectionDoc>): CollectionRef | null {
  const c = populated<CollectionDoc>(doc)
  if (!c) return null
  const agreements = (c.agreements ?? []).map(toAgreement).filter((a): a is Agreement => a !== null)
  return { id: String(c.id), kind, slug: c.slug ?? String(c.id), title: c.title, agreements }
}

type PostLike = Pick<Post, 'id' | '_status' | 'publishedAt' | 'format' | 'fellowship' | 'series' | 'production' | 'categories'>

/**
 * A publishing identity is attribution, not funding, so it is not read here at all.
 * Needs the post loaded to depth 3: post → fellowship/series/production → agreement → sponsor. */
export function toContentRef(post: PostLike): ContentRef {
  const collections: CollectionRef[] = [
    toCollectionRef('fellowship', post.fellowship as Rel<CollectionDoc>),
    toCollectionRef('series', post.series as Rel<CollectionDoc>),
    toCollectionRef('production', post.production as Rel<CollectionDoc>),
    ...((post.categories ?? []) as Rel<CollectionDoc>[]).map((t) => toCollectionRef('topic', t)),
  ].filter((c): c is CollectionRef => c !== null)
  return {
    id: String(post.id),
    format: (post.format ?? 'web') as ContentFormat,
    // A draft carries no recognition even if a publish date was typed in.
    publishedAt: post._status === 'published' ? (post.publishedAt ?? null) : null,
    collections,
  }
}

/** Loads a post and decides what acknowledgments it carries. `now` is injected so callers control the clock. */
export async function getAcknowledgments(
  payload: Payload,
  postId: string | number,
  placement: Placement,
  now: string,
): Promise<Resolution> {
  const post = await payload.findByID({ collection: 'posts', id: postId, depth: 3, overrideAccess: true })
  return resolveUnderwriting(toContentRef(post as unknown as PostLike), { placement, now })
}
