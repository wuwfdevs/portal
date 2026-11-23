import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

import { unearthingPages } from '../lib/unearthing/to-sections'

/**
 * Unearthing Florida's home page (hubs redesign, 2026-11-23; PAGE-BLOCKS.md phase 6): the show's address, `/shows/unearthing-florida`, renders a page of blocks, and the show is listed like
 * every other show. Written through the Local API from the words the coded hub held (the hub's dateline and "About the project", the production's title and summary, the collections that
 * have episodes), by `lib/unearthing/to-sections.ts` (pure and tested: nothing bracketed on the canvas prints, and no count is typed). The coded hub is gone in the same change and
 * `/unearthing-florida` redirects to the show.
 *
 * Where there is no Unearthing Florida production at that address (production before launch, a new station) nothing is written: production gets its pages at launch with the rest of its
 * content (`ROADMAP.md`, "Launch: initializing production"). A show that already has a home page is left alone, so a re-run changes nothing. Listing the show is the owner's instruction for
 * staging (2026-11-23); it is the only change made to the production.
 *
 * `down` removes the two pages this wrote (and nothing else) and leaves the show as it is listed: it cannot know whether the owner has listed it since.
 */
const SHOW_PATH = '/shows/unearthing-florida'
const SLUGS = ['unearthing-florida-home', 'unearthing-florida-about']

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  const show = (await payload.find({ collection: 'productions', where: { path: { equals: SHOW_PATH } }, limit: 1, depth: 0, overrideAccess: true, req })).docs[0]
  if (!show) return
  const homes = await payload.find({ collection: 'pages', where: { and: [{ show: { equals: show.id } }, { isShowHome: { equals: true } }] }, limit: 1, depth: 0, draft: true, overrideAccess: true, req })
  if (homes.docs.length > 0) return

  const hub = await payload.findGlobal({ slug: 'unearthing-hub', depth: 0, overrideAccess: true, req })
  // The collections (series) that have a published episode of the show, in the order they were made.
  const episodes = await payload.find({ collection: 'posts', where: { and: [{ production: { equals: show.id } }, { series: { exists: true } }] }, limit: 2000, pagination: false, depth: 0, draft: false, overrideAccess: true, req, select: { series: true } })
  const seriesIds = [...new Set(episodes.docs.map((e) => (typeof e.series === 'object' && e.series ? e.series.id : e.series)).filter((id): id is number => typeof id === 'number'))].sort((a, b) => a - b)
  const series = seriesIds.length > 0 ? await payload.find({ collection: 'series', where: { id: { in: seriesIds } }, limit: seriesIds.length, pagination: false, depth: 0, overrideAccess: true, req, sort: 'id' }) : { docs: [] }

  const context = { disableRevalidate: true, disableEmbedding: true }
  for (const page of unearthingPages({
    title: show.title,
    summary: show.summary ?? null,
    dateline: hub?.dateline ?? null,
    about: hub?.about ?? null,
    collections: series.docs.filter((s) => typeof s.slug === 'string' && s.slug !== '').map((s) => ({ title: s.title, slug: s.slug as string, summary: s.summary ?? null })),
    showPath: SHOW_PATH,
  })) {
    const found = await payload.find({ collection: 'pages', where: { slug: { equals: page.slug } }, limit: 1, depth: 0, draft: true, overrideAccess: true, req })
    if (found.docs.length > 0) continue
    await payload.create({
      collection: 'pages',
      data: {
        title: page.title,
        slug: page.slug,
        ...(page.path ? { path: page.path } : {}),
        template: 'sections',
        pageSet: 'unearthing',
        show: show.id,
        isShowHome: page.isShowHome,
        navHidden: page.navHidden,
        ...(page.navLabel ? { navLabel: page.navLabel } : {}),
        navOrder: page.navOrder,
        sections: page.sections,
        ...(page.description ? { meta: { title: page.title, description: page.description } } : {}),
        _status: 'published',
      } as never,
      draft: false,
      overrideAccess: true,
      req,
      context,
    })
  }
  if (!show.listed) await payload.update({ collection: 'productions', id: show.id, data: { listed: true } as never, overrideAccess: true, req, context })
}

export async function down({ payload, req }: MigrateDownArgs): Promise<void> {
  await payload.delete({ collection: 'pages', where: { slug: { in: SLUGS } }, overrideAccess: true, req, context: { disableRevalidate: true } })
}
