import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

import { staffRole } from '../lib/voyager/arrange'
import { voyagerPages } from '../lib/voyager/to-sections'

/**
 * The Voyager's hub and its About page (hubs redesign, 2026-11-23; PAGE-BLOCKS.md phase 6): `/voyager` and `/voyager/about` render pages of blocks in the voyager set, and the coded hub is gone in
 * the same change. Written through the Local API from the words the coded hub's global held (the tagline, the featured story, the sections, the podcast, the staff and the invitation to join) by
 * `lib/voyager/to-sections.ts` (pure and tested). The hub's footnote is copied into Shared text → The Voyager's foot (`shared_text.voyager_footnote`, added by `20261123_030000_voyager_footnote_column`),
 * where the set's foot prints it under every page of the Voyager, and is carried on the About page too. The footnote is written with SQL, not the Local API, so no other field of the global is rewritten.
 *
 * Where the hub is not set up (no publishing identity chosen: production before launch, a new station) nothing is written; production gets its pages at launch with the rest of its content
 * (`ROADMAP.md`, "Launch: initializing production"). A page that already exists is left alone, and a footnote already typed in Shared text is kept, so a re-run changes nothing.
 *
 * `down` removes the two pages this wrote and leaves the footnote where it is (Shared text may have been edited since).
 */
const SLUGS = ['voyager', 'voyager-about', 'voyager-video', 'voyager-shows', 'voyager-staff']

const idOf = (v: unknown): number | null => {
  if (typeof v === 'number') return v
  if (v && typeof v === 'object' && 'id' in v && typeof (v as { id: unknown }).id === 'number') return (v as { id: number }).id
  return null
}
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

export async function up({ payload, req, db }: MigrateUpArgs): Promise<void> {
  const hub = await payload.findGlobal({ slug: 'voyager-hub', depth: 1, overrideAccess: true, req })
  if (idOf(hub.identity) === null) return

  const sections = (hub.sections ?? []).flatMap((s) => (s && typeof s === 'object' ? [{ id: s.id, title: s.title, slug: typeof s.slug === 'string' ? s.slug : null }] : []))
  const staff = (hub.staff ?? []).flatMap((m) => {
    const person = m.person && typeof m.person === 'object' ? m.person : null
    return person ? [{ name: person.name, role: text(staffRole(m.role, person.title)), photoId: idOf(person.photo) }] : []
  })
  const footnote = text(hub.footnote)
  const { home, about, listings } = voyagerPages({
    tagline: text(hub.tagline),
    leadId: idOf(hub.featured),
    sections,
    showIds: idOf(hub.podcast) !== null ? [idOf(hub.podcast)!] : [],
    staff,
    join: { heading: text(hub.join?.heading), text: text(hub.join?.text), href: text(hub.join?.href) },
    footnote,
  })

  if (footnote) {
    // A database that has never saved Shared text (a new station) has no row yet: make it, then fill the footnote only where nothing was typed.
    await db.execute(sql`INSERT INTO "shared_text" ("id", "updated_at", "created_at") SELECT 1, now(), now() WHERE NOT EXISTS (SELECT 1 FROM "shared_text")`)
    await db.execute(sql`UPDATE "shared_text" SET "voyager_footnote" = ${footnote} WHERE "voyager_footnote" IS NULL OR "voyager_footnote" = ''`)
  }

  const context = { disableRevalidate: true, disableEmbedding: true }
  for (const page of [home, about, ...listings]) {
    const found = await payload.find({ collection: 'pages', where: { slug: { equals: page.slug } }, limit: 1, depth: 0, draft: true, overrideAccess: true, req })
    if (found.docs.length > 0) continue
    await payload.create({
      collection: 'pages',
      data: {
        title: page.title,
        slug: page.slug,
        path: page.path,
        template: 'sections',
        pageSet: 'voyager',
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
}

export async function down({ payload, req }: MigrateDownArgs): Promise<void> {
  await payload.delete({ collection: 'pages', where: { slug: { in: SLUGS } }, overrideAccess: true, req, context: { disableRevalidate: true } })
}
