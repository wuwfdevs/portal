import type { Metadata } from 'next'

import configPromise from '@payload-config'
import { draftMode } from 'next/headers'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Page, Post } from '@/payload-types'

import { StoryView } from '@/components/Article/StoryView'
import { PageView } from '@/components/PageView'
import { EventView } from '@/components/Events/EventView'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import { ShowView } from '@/components/Show/ShowView'
import { StoryListView } from '@/components/StoryList/StoryListView'
import { loadEventByPath, type EventPageData } from '@/lib/events/load'
import { loadStoryListFor, type StoryListData } from '@/lib/lists/load'
import { listHref, parseListRequest } from '@/lib/lists/route'
import { pathFromSegments } from '@/lib/paths'
import { loadShowByPath, type ShowData } from '@/lib/shows/load'
import { getCachedGlobal } from '@/utilities/getGlobals'
import { generateMeta } from '@/utilities/generateMeta'
import { resolveDraftById, resolvePath } from '@/utilities/resolvePath'

// One route for every address on the site (ROADMAP → URL scheme): a path resolves to a story or a page. A campaign agreement shows only while its term runs, and a deleted agreement cannot name the pages it
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
  | { kind: 'list'; data: StoryListData; url: string }
  | { kind: 'show'; data: ShowData; url: string }
  | { kind: 'event'; data: EventPageData; url: string }
  | { kind: 'miss'; url: string }

/** `joined` is the request's segments joined with "/" (empty for "/"); a string, so React's cache can key on it. */
const resolveRequest = cache(async (joined: string, draft: boolean): Promise<Result> => {
  const segments = joined === '' ? undefined : joined.split('/')

  // "/" is not resolved here: the home page has its own route (app/(frontend)/page.tsx).
  if (!segments) return { kind: 'miss', url: '/' }

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
  if (hit) return { kind: hit.kind, doc: hit.doc, url: path } as Result

  // A show (an original production) at its own address.
  const show = await loadShowByPath(path)
  if (show) return { kind: 'show', data: show, url: path }

  // A community-calendar event at its own address.
  const event = await loadEventByPath(path)
  if (event) return { kind: 'event', data: event, url: path }

  // No story, page, show or event owns it: it may be a list (a section, a topic, a person), at its page number if it has one.
  const list = parseListRequest(segments)
  const data = list ? await loadStoryListFor(list) : null
  return data ? { kind: 'list', data, url: path } : { kind: 'miss', url: path }
})

export default async function CatchAllPage({ params: paramsPromise }: Args) {
  const { isEnabled: draft } = await draftMode()
  const { path: segments } = await paramsPromise
  const result = await resolveRequest((segments ?? []).join('/'), draft)

  // Nothing owns this path: a redirect an editor made for it, or a real 404.
  if (result.kind === 'miss') return <PayloadRedirects url={result.url} />
  if (result.kind === 'post') return <StoryView draft={draft} post={result.doc} url={result.url} />
  if (result.kind === 'list') return <StoryListView data={result.data} />
  if (result.kind === 'event') return <EventView data={result.data} />
  if (result.kind === 'show') {
    const settings = await getCachedGlobal('site-settings', 1)()
    const policy = settings?.independencePolicy && typeof settings.independencePolicy === 'object' ? settings.independencePolicy : null
    return <ShowView data={result.data} independenceHref={policy?.slug ? `/${policy.slug}` : null} />
  }
  return <PageView draft={draft} page={result.doc as Page} url={result.url} />
}

export async function generateMetadata({ params: paramsPromise }: Args): Promise<Metadata> {
  const { isEnabled: draft } = await draftMode()
  const { path: segments } = await paramsPromise
  const result = await resolveRequest((segments ?? []).join('/'), draft)
  if (result.kind === 'show') return { title: result.data.show.title, description: result.data.show.summary ?? undefined }
  if (result.kind === 'event') return { title: result.data.event.title, description: result.data.event.teaser ?? undefined, alternates: { canonical: result.url } }
  if (result.kind === 'list') {
    const { kind, slug, title, blurb, page } = result.data
    return {
      title: `${title}${page > 1 ? ` (page ${page})` : ''}`,
      description: blurb ?? undefined,
      // Page 2 and beyond are their own addresses; each is its own canonical, and none is blocked from search.
      alternates: { canonical: listHref(kind, slug, page) },
    }
  }
  return generateMeta({ doc: result.kind === 'miss' ? null : result.doc })
}
