import type { Metadata } from 'next'

import type { Page, Post } from '../payload-types'

import { SITE_NAME, imageUrlOf, leadImageOf, storyMetadata, storySeoInputOf, trimDescription } from '../lib/seo/meta'
import { getServerSideURL } from './getURL'
import { mergeOpenGraph } from './mergeOpenGraph'

/**
 * The metadata for a standard page: its SEO title if one was written, else its title (the layout adds "| WUWF"); its SEO image, else its first
 * picture; its description trimmed to what a search result shows. Anything missing falls back to the station's own defaults, never a placeholder.
 */
export const generateMeta = async (args: { doc: Partial<Page> | Partial<Post> | null }): Promise<Metadata> => {
  const { doc } = args
  const siteUrl = getServerSideURL()
  const image = doc ? imageUrlOf(leadImageOf(doc as Parameters<typeof leadImageOf>[0]), siteUrl) : null
  const title = doc?.meta?.title?.trim() || doc?.title?.trim() || undefined
  const description = trimDescription(doc?.meta?.description) ?? undefined

  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    openGraph: mergeOpenGraph({
      ...(description ? { description } : {}),
      ...(image ? { images: [{ url: image }] } : {}),
      title: title ?? SITE_NAME,
      url: doc?.path ?? '/',
    }),
    // The canonical address is the path itself (a trailing slash redirects to it; ROADMAP → URL scheme).
    ...(doc?.path ? { alternates: { canonical: doc.path } } : {}),
  }
}

/** The metadata for a story: see `lib/seo/meta.ts` for the fallback chain. */
export const generateStoryMeta = (post: Post): Metadata => {
  const meta = storyMetadata(storySeoInputOf(post, getServerSideURL()))
  return { ...meta, openGraph: mergeOpenGraph(meta.openGraph) }
}
