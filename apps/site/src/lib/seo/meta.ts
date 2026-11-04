// What a story tells search engines and social cards: its title, description, share image, dates and authors, and the schema.org
// markup. Pure: it reads plain values and returns plain values, so it is tested without a database or a request.
//
// Why it exists: the page metadata was the Payload starter's placeholder ("Payload Website Template" as every title, the starter's
// picture as every share image), and the importer sets no SEO title or image, so every migrated story shipped that. The rule now is a
// fallback chain that needs nothing an editor must remember to fill in: an SEO title if one was written, else the story's title; an SEO
// image if one was picked, else the story's lead photo; an SEO description if one was written, else the dek.

import type { Metadata } from 'next'

export const SITE_NAME = 'WUWF Public Media'
export const DESCRIPTION_MAX = 160
/** A sentence is a good place to stop only if it leaves a description worth reading. */
const MIN_SENTENCE_STOP = 60

/**
 * Plain text cut to at most `max` characters: at the end of a sentence when one fits after `MIN_SENTENCE_STOP` characters, otherwise at
 * a word, with an ellipsis. Text that already fits is returned as it is (whitespace tidied). Nothing is added to the words.
 */
export function trimDescription(text: string | null | undefined, max = DESCRIPTION_MAX): string | null {
  const t = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return null
  if (t.length <= max) return t
  const head = t.slice(0, max)
  const stops = [...head.matchAll(/[.!?]["'”’)]*(?=\s)/g)].map((m) => m.index! + m[0].length)
  const stop = [...stops].reverse().find((i) => i >= MIN_SENTENCE_STOP)
  if (stop !== undefined) return head.slice(0, stop).trim()
  const cut = head.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  const words = (space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:–—-]+$/, '')
  return `${words}…`
}

export interface MediaLike {
  url?: string | null
  alt?: string | null
  sizes?: { og?: { url?: string | null } | null } | null
}

const asMedia = (v: unknown): MediaLike | null => (v && typeof v === 'object' ? (v as MediaLike) : null)

type Block = { blockType?: string; media?: unknown; images?: { image?: unknown }[] | null; poster?: unknown }

/**
 * The picture a story is known by: the SEO image if an editor picked one, else the first picture of its lead (a photo, the first photo of
 * a gallery, a video's poster). A relation that was not loaded (a bare id) is not a picture here.
 */
export function leadImageOf(doc: { meta?: { image?: unknown } | null; featuredMedia?: readonly unknown[] | null }): MediaLike | null {
  const chosen = asMedia(doc.meta?.image)
  if (chosen?.url) return chosen
  for (const item of (doc.featuredMedia ?? []) as Block[]) {
    const candidate =
      item.blockType === 'mediaBlock' ? asMedia(item.media) : item.blockType === 'gallery' ? asMedia(item.images?.[0]?.image) : item.blockType === 'videoPlayer' ? asMedia(item.poster) : null
    if (candidate?.url) return candidate
  }
  return null
}

/** An absolute address for a picture, preferring the share-card size. Null when the picture has none. */
export function imageUrlOf(media: MediaLike | null, siteUrl: string): string | null {
  const raw = media?.sizes?.og?.url || media?.url
  if (!raw) return null
  return /^https?:\/\//i.test(raw) ? raw : `${siteUrl.replace(/\/$/, '')}${raw.startsWith('/') ? '' : '/'}${raw}`
}

export interface StorySeoInput {
  title: string
  metaTitle?: string | null
  metaDescription?: string | null
  dek?: string | null
  path?: string | null
  publishedAt?: string | null
  modifiedAt?: string | null
  authors: readonly string[]
  section?: string | null
  image?: { url: string; alt?: string | null } | null
  siteUrl: string
}

const pick = (v: string | null | undefined): string | undefined => (v && v.trim() ? v.trim() : undefined)

/** The metadata for a story page. Share-card fields are only present when there is something true to put in them. */
export function storyMetadata(i: StorySeoInput): Metadata {
  const title = pick(i.metaTitle) ?? i.title
  const description = trimDescription(pick(i.metaDescription) ?? i.dek) ?? undefined
  const url = i.path ? `${i.siteUrl.replace(/\/$/, '')}${i.path}` : undefined
  const images = i.image ? [{ url: i.image.url, ...(pick(i.image.alt) ? { alt: pick(i.image.alt)! } : {}) }] : undefined
  return {
    title,
    ...(description ? { description } : {}),
    // The canonical address is the path itself (a trailing slash redirects to it; ROADMAP → URL scheme).
    ...(i.path ? { alternates: { canonical: i.path } } : {}),
    openGraph: {
      type: 'article',
      title,
      ...(description ? { description } : {}),
      ...(url ? { url } : {}),
      siteName: SITE_NAME,
      ...(images ? { images } : {}),
      ...(i.publishedAt ? { publishedTime: i.publishedAt } : {}),
      ...(i.modifiedAt ? { modifiedTime: i.modifiedAt } : {}),
      ...(i.authors.length ? { authors: [...i.authors] } : {}),
      ...(pick(i.section) ? { section: pick(i.section)! } : {}),
    },
    twitter: { card: images ? 'summary_large_image' : 'summary', title, ...(description ? { description } : {}), ...(images ? { images: images.map((x) => x.url) } : {}) },
  }
}

/** schema.org `NewsArticle` for a story. A story with no byline is the station's. */
export function storySchema(i: StorySeoInput): Record<string, unknown> {
  const url = i.path ? `${i.siteUrl.replace(/\/$/, '')}${i.path}` : undefined
  const description = trimDescription(pick(i.metaDescription) ?? i.dek)
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    // Search engines show about 110 characters of a headline; the full title is still the page's title.
    headline: (pick(i.metaTitle) ?? i.title).slice(0, 110),
    ...(url ? { url, mainEntityOfPage: { '@type': 'WebPage', '@id': url } } : {}),
    ...(description ? { description } : {}),
    ...(i.image ? { image: [i.image.url] } : {}),
    ...(i.publishedAt ? { datePublished: i.publishedAt } : {}),
    ...(i.modifiedAt ? { dateModified: i.modifiedAt } : i.publishedAt ? { dateModified: i.publishedAt } : {}),
    author: i.authors.length ? i.authors.map((name) => ({ '@type': 'Person', name })) : [{ '@type': 'Organization', name: SITE_NAME }],
    ...(pick(i.section) ? { articleSection: pick(i.section)! } : {}),
    publisher: { '@type': 'NewsMediaOrganization', name: SITE_NAME },
  }
}

type NamedLike = { name?: string | null; title?: string | null } | number | string | null | undefined

/** The plain inputs for a loaded story (depth 1, so its relations are objects). `modifiedAt` is Grove's date for a migrated story: never import time. */
export function storySeoInputOf(
  post: {
    title: string
    dek?: string | null
    path?: string | null
    publishedAt?: string | null
    updatedAt?: string | null
    meta?: { title?: string | null; description?: string | null; image?: unknown } | null
    featuredMedia?: readonly unknown[] | null
    contributors?: readonly NamedLike[] | null
    section?: NamedLike
    legacy?: { modifiedAt?: string | null } | null
  },
  siteUrl: string,
): StorySeoInput {
  const nameOf = (v: NamedLike): string | null => (v && typeof v === 'object' ? pick(v.name) ?? pick(v.title) ?? null : null)
  const media = leadImageOf(post)
  const imageUrl = imageUrlOf(media, siteUrl)
  return {
    title: post.title,
    metaTitle: post.meta?.title,
    metaDescription: post.meta?.description,
    dek: post.dek,
    path: post.path,
    publishedAt: post.publishedAt,
    modifiedAt: post.legacy?.modifiedAt ?? post.updatedAt,
    authors: (post.contributors ?? []).map(nameOf).filter((n): n is string => n !== null),
    section: nameOf(post.section),
    image: imageUrl ? { url: imageUrl, alt: media?.alt ?? null } : null,
    siteUrl,
  }
}
