import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

import { stationPagesFrom } from '../lib/station-pages/to-sections'

/**
 * The broadcast schedule and the podcast directory move into `pages` as sections (PAGE-BLOCKS.md, phase 5). Each is written at the address it already has
 * (/schedule, /podcasts) through the Local API: the schedule's "other ways to listen" cards are read from the Listen live global's **current** rows, so a
 * staging database keeps whatever an editor has changed. The pages are in no page set (any editor may change them) and published. A page that already exists
 * at its address, or whose slug is taken, is left alone, so a re-run changes nothing.
 *
 * The same change deletes the two coded routes and the directory view. The Listen live global keeps its cards field, hidden, until phase 7 drops it.
 *
 * `down` removes the two pages this wrote (and nothing else); the coded routes come back with the code.
 */
const PATHS = ['/schedule', '/podcasts']

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  const live = await payload.findGlobal({ slug: 'listen-live', depth: 0, overrideAccess: true, req })
  const context = { disableRevalidate: true, disableEmbedding: true }
  for (const page of stationPagesFrom(live?.otherWays)) {
    const found = await payload.find({
      collection: 'pages',
      where: { or: [{ path: { equals: page.path } }, { slug: { equals: page.slug } }] },
      limit: 1,
      depth: 0,
      draft: true,
      overrideAccess: true,
      req,
    })
    if (found.docs.length > 0) continue
    await payload.create({
      collection: 'pages',
      data: {
        title: page.title,
        slug: page.slug,
        path: page.path,
        template: 'sections',
        sections: page.sections,
        meta: { title: page.title, description: page.description },
        _status: 'published',
      } as never,
      draft: false,
      overrideAccess: true,
      req,
      context,
    })
  }
}

export async function down({ payload, req }: MigrateDownArgs): Promise<void> {
  await payload.delete({ collection: 'pages', where: { and: [{ path: { in: PATHS } }, { template: { equals: 'sections' } }] }, overrideAccess: true, req, context: { disableRevalidate: true } })
}
