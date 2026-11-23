import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

import { radioLivePages } from '../lib/radiolive/to-sections'

/**
 * RadioLive's page and its "All artists" page (hubs redesign, 2026-11-23; PAGE-BLOCKS.md phase 6): `/radiolive` and `/radiolive/artists` render pages of blocks in the radiolive set, and the
 * coded hub is gone in the same change. Written through the Local API from the words the coded hub's global held (the tagline, the host, Encores, the call to support and the membership
 * level) by `lib/radiolive/to-sections.ts` (pure and tested: no word is lost, nothing bracketed on the canvas prints, no count is typed). The page names the RadioLive production, so the
 * funder line under it is the production's running agreements; RadioLive is an area of the site and the page is not a show's home.
 *
 * Where there is no RadioLive (no show and no production chosen: production before launch, a new station) nothing is written: production gets its pages at launch with the rest of its
 * content (`ROADMAP.md`, "Launch: initializing production"). A page that already exists is left alone, so a re-run changes nothing.
 *
 * `down` removes the two pages this wrote (and nothing else).
 */
const SLUGS = ['radiolive', 'radiolive-artists']

const idOf = (v: unknown): number | null => {
  if (typeof v === 'number') return v
  if (v && typeof v === 'object' && 'id' in v && typeof (v as { id: unknown }).id === 'number') return (v as { id: number }).id
  return null
}
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  const hub = await payload.findGlobal({ slug: 'radiolive-hub', depth: 0, overrideAccess: true, req })
  const production = idOf(hub.production)
  const shows = await payload.count({ collection: 'performances', overrideAccess: true, req })
  if (production === null && shows.totalDocs === 0) return

  const { home, artists } = radioLivePages({
    tagline: text(hub.tagline),
    heroPhotoId: idOf(hub.heroPhoto),
    host: { kicker: text(hub.host?.kicker), heading: text(hub.host?.heading), text: text(hub.host?.text), portraitId: idOf(hub.host?.portrait), href: text(hub.host?.href) },
    encores: { heading: text(hub.encores?.heading), text: text(hub.encores?.text), linkLabel: text(hub.encores?.linkLabel), href: text(hub.encores?.href) },
    support: { heading: text(hub.support?.heading), text: text(hub.support?.text), note: text(hub.support?.note) },
    membership: hub.membership?.heading?.trim()
      ? { heading: text(hub.membership.heading), text: text(hub.membership.text), contactName: text(hub.membership.contactName), contactEmail: text(hub.membership.contactEmail), contactPhone: text(hub.membership.contactPhone), href: text(hub.membership.href) }
      : null,
  })

  const context = { disableRevalidate: true, disableEmbedding: true }
  const specs = [
    { slug: home.slug, title: home.title, path: home.path, navLabel: 'Overview', navOrder: 1, description: home.description, sections: home.sections },
    { slug: artists.slug, title: artists.title, path: artists.path, navLabel: artists.navLabel, navOrder: 2, description: null, sections: artists.sections },
  ]
  for (const page of specs) {
    const found = await payload.find({ collection: 'pages', where: { slug: { equals: page.slug } }, limit: 1, depth: 0, draft: true, overrideAccess: true, req })
    if (found.docs.length > 0) continue
    await payload.create({
      collection: 'pages',
      data: {
        title: page.title,
        slug: page.slug,
        path: page.path,
        template: 'sections',
        pageSet: 'radiolive',
        ...(production !== null ? { show: production } : {}),
        navLabel: page.navLabel,
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
}

export async function down({ payload, req }: MigrateDownArgs): Promise<void> {
  await payload.delete({ collection: 'pages', where: { slug: { in: SLUGS } }, overrideAccess: true, req, context: { disableRevalidate: true } })
}
