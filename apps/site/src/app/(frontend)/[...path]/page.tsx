import type { Metadata } from 'next'

import configPromise from '@payload-config'
import { draftMode } from 'next/headers'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Page, Post } from '@/payload-types'

import { StoryView } from '@/components/Article/StoryView'
import { PageView } from '@/components/PageView'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import { homeStatic } from '@/endpoints/seed/home-static'
import { pathFromSegments } from '@/lib/paths'
import { generateMeta } from '@/utilities/generateMeta'
import { resolveDraftById, resolveHome, resolvePath } from '@/utilities/resolvePath'

// One route for every address on the site (ROADMAP → URL scheme): a path resolves to a story or a page, and "/" to the
// home page. A campaign agreement shows only while its term runs, and a deleted agreement cannot name the pages it
// reached, so these pages also refresh on a schedule.
export const revalidate = 3600

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const [posts, pages] = await Promise.all(
    (['posts', 'pages'] as const).map((collection) =>
      payload.find({ collection, draft: false, limit: 1000, overrideAccess: false, pagination: false, select: { path: true } }),
    ),
  )
  return [...(posts?.docs ?? []), ...(pages?.docs ?? [])]
    .filter((doc): doc is typeof doc & { path: string } => typeof doc.path === 'string' && doc.path.length > 1)
    .map(({ path }) => ({ path: path.split('/').filter(Boolean) }))
}

type Args = { params: Promise<{ path?: string[] }> }

type Result =
  | { kind: 'post'; doc: Post; url: string }
  | { kind: 'page'; doc: Pick<Page, 'hero' | 'layout' | 'meta'> & Partial<Page>; url: string }
  | { kind: 'miss'; url: string }

/** `joined` is the request's segments joined with "/" (empty for "/"); a string, so React's cache can key on it. */
const resolveRequest = cache(async (joined: string, draft: boolean): Promise<Result> => {
  const segments = joined === '' ? undefined : joined.split('/')

  if (!segments) {
    const home = (await resolveHome(draft)) ?? homeStatic
    return { kind: 'page', doc: home as Page, url: '/' }
  }

  // A draft that was never published has no path yet: its preview address is /_draft/{collection}/{id}, and only
  // works with the preview cookie (the preview route sets it for signed-in staff).
  if (segments[0] === '_draft') {
    const [, collection, id] = segments
    if (!draft || segments.length !== 3 || (collection !== 'posts' && collection !== 'pages') || !id) return { kind: 'miss', url: `/${joined}` }
    const hit = await resolveDraftById(collection, decodeURIComponent(id))
    return hit ? { kind: hit.kind, doc: hit.doc, url: `/${joined}` } as Result : { kind: 'miss', url: `/${joined}` }
  }

  const path = pathFromSegments(segments)
  if (!path) return { kind: 'miss', url: `/${joined}` }
  const hit = await resolvePath(path, draft)
  return hit ? ({ kind: hit.kind, doc: hit.doc, url: path } as Result) : { kind: 'miss', url: path }
})

export default async function CatchAllPage({ params: paramsPromise }: Args) {
  const { isEnabled: draft } = await draftMode()
  const { path: segments } = await paramsPromise
  const result = await resolveRequest((segments ?? []).join('/'), draft)

  // Nothing owns this path: a redirect an editor made for it, or a real 404.
  if (result.kind === 'miss') return <PayloadRedirects url={result.url} />
  if (result.kind === 'post') return <StoryView draft={draft} post={result.doc} url={result.url} />
  return <PageView draft={draft} page={result.doc as Page} url={result.url} />
}

export async function generateMetadata({ params: paramsPromise }: Args): Promise<Metadata> {
  const { isEnabled: draft } = await draftMode()
  const { path: segments } = await paramsPromise
  const result = await resolveRequest((segments ?? []).join('/'), draft)
  return generateMeta({ doc: result.kind === 'miss' ? null : result.doc })
}
