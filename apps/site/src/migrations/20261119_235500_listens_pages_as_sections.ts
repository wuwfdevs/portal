import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

import { listensPages } from '../lib/listening/hub-pages'

/**
 * The WUWF Listens hub and the host form's page move into `pages` as sections (PAGE-BLOCKS.md, phase 5). Each is written at the address it already has
 * (/listens, /listens/host) in the listens set, through the Local API, from the words that were typed in the hub's component and the host page
 * (`lib/listening/hub-pages.ts`). What the hub shows is the Portal's and is drawn by the Listens blocks, so nothing here is copied from a database. The pages
 * are published. A page that already exists at its address, or whose slug is taken, is left alone, so a re-run changes nothing.
 *
 * The same change makes `/listens` and `/listens/host` coded shells that render their page record (the hub needs the Portal's answer per request, with the
 * reader's hashed address, which only a route may read) and deletes the hub's coded view.
 *
 * `down` removes the two pages this wrote (and nothing else); the coded view comes back with the code.
 */
const PATHS = ['/listens', '/listens/host']

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  const context = { disableRevalidate: true, disableEmbedding: true }
  for (const page of listensPages()) {
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
        pageSet: 'listens',
        navLabel: page.navLabel,
        navOrder: page.navOrder,
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
  await payload.delete({ collection: 'pages', where: { and: [{ path: { in: PATHS } }, { pageSet: { equals: 'listens' } }] }, overrideAccess: true, req, context: { disableRevalidate: true } })
}
