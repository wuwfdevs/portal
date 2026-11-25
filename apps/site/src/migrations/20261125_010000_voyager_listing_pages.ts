import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

import { voyagerPages, type VoyagerFacts } from '../lib/voyager/to-sections'

/**
 * The Voyager's Video, Shows and Staff each get a full listing page (2026-11-25): `/voyager/video`, `/voyager/shows`, `/voyager/staff`. The hub's three sections link to them ("All video →") and the strip's
 * Video, Shows and Staff links go to them, as the news runs' links go to their sections' pages; the pages keep the hub's strip (the pages are in the voyager set). Written for the hub page
 * `20261123_030100_voyager_page` already wrote (staging); `lib/voyager/to-sections.ts` writes the same for a database built from the migrations.
 *
 * The listing pages are built from the hub page's own sections (its shows and its roster as they are now, which an editor may have changed), by the same mapper. Only the strip and "more"
 * fields of `vy-video`, `vy-shows` and `vy-staff` are touched, and only where empty. Nothing is written where there is no hub page; a page that already exists is left alone, so a re-run
 * changes nothing. `down` removes the three pages and empties the links this wrote (a link an editor changed is left).
 */
type Section = Record<string, unknown> & { id?: string; blockType?: string; navHref?: string | null; moreLabel?: string | null; moreHref?: string | null }

const SLUGS = ['voyager-video', 'voyager-shows', 'voyager-staff']
const LINKS: Record<string, { navHref: string; moreLabel: string; moreHref: string }> = {
  'vy-video': { navHref: '/voyager/video', moreLabel: 'All video →', moreHref: '/voyager/video' },
  'vy-shows': { navHref: '/voyager/shows', moreLabel: 'All Voyager shows →', moreHref: '/voyager/shows' },
  'vy-staff': { navHref: '/voyager/staff', moreLabel: 'Full staff page →', moreHref: '/voyager/staff' },
}
const blank = (v: unknown) => typeof v !== 'string' || v.trim() === ''
const idOf = (v: unknown): number | string | null => (typeof v === 'number' || typeof v === 'string' ? v : v && typeof v === 'object' && 'id' in v ? ((v as { id: number | string }).id ?? null) : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

async function hubPage(args: MigrateUpArgs | MigrateDownArgs) {
  const found = await args.payload.find({ collection: 'pages', where: { and: [{ slug: { equals: 'voyager' } }, { pageSet: { equals: 'voyager' } }] }, limit: 1, depth: 0, draft: false, overrideAccess: true, req: args.req })
  return found.docs[0] ?? null
}

export async function up(args: MigrateUpArgs): Promise<void> {
  const hub = await hubPage(args)
  if (!hub) return
  const sections = (hub.sections ?? []) as unknown as Section[]
  const byId = (id: string) => sections.find((s) => s.id === id)

  const people = ((byId('vy-staff')?.people ?? []) as Array<{ name?: string; role?: string; photo?: unknown }>).filter((p) => str(p.name))
  const join = byId('vy-join') as (Section & { heading?: { title?: string; intro?: string }; actions?: Array<{ href?: string }> }) | undefined
  const facts: VoyagerFacts = {
    tagline: null,
    leadId: null,
    sections: [],
    showIds: ((byId('vy-shows')?.onlyShows ?? []) as unknown[]).map(idOf).filter((v): v is number | string => v !== null),
    staff: people.map((p) => ({ name: p.name!, role: str(p.role), photoId: idOf(p.photo) })),
    join: { heading: str(join?.heading?.title), text: str(join?.heading?.intro), href: str(join?.actions?.[0]?.href) },
    footnote: null,
  }

  for (const page of voyagerPages(facts).listings) {
    const found = await args.payload.find({ collection: 'pages', where: { slug: { equals: page.slug } }, limit: 1, depth: 0, draft: true, overrideAccess: true, req: args.req })
    if (found.docs.length > 0) continue
    await args.payload.create({
      collection: 'pages',
      data: { title: page.title, slug: page.slug, path: page.path, template: 'sections', pageSet: 'voyager', navHidden: page.navHidden, navOrder: page.navOrder, sections: page.sections, _status: 'published' } as never,
      draft: false,
      overrideAccess: true,
      req: args.req,
      context: { disableRevalidate: true, disableEmbedding: true },
    })
  }

  let changed = false
  const next = sections.map((s) => {
    const link = s.id ? LINKS[s.id] : undefined
    if (!link) return s
    const out = { ...s }
    if (blank(s.navHref)) { out.navHref = link.navHref; changed = true }
    if (blank(s.moreHref)) { out.moreHref = link.moreHref; out.moreLabel = blank(s.moreLabel) ? link.moreLabel : s.moreLabel; changed = true }
    return out
  })
  if (changed) await args.payload.update({ collection: 'pages', id: hub.id, data: { sections: next } as never, draft: false, overrideAccess: true, req: args.req, context: { disableRevalidate: true } })
}

export async function down(args: MigrateDownArgs): Promise<void> {
  const hub = await hubPage(args)
  if (hub) {
    let changed = false
    const next = ((hub.sections ?? []) as unknown as Section[]).map((s) => {
      const link = s.id ? LINKS[s.id] : undefined
      if (!link) return s
      const out = { ...s }
      if (s.navHref === link.navHref) { out.navHref = ''; changed = true }
      if (s.moreHref === link.moreHref) { out.moreHref = ''; out.moreLabel = s.moreLabel === link.moreLabel ? '' : s.moreLabel; changed = true }
      return out
    })
    if (changed) await args.payload.update({ collection: 'pages', id: hub.id, data: { sections: next } as never, draft: false, overrideAccess: true, req: args.req, context: { disableRevalidate: true } })
  }
  await args.payload.delete({ collection: 'pages', where: { slug: { in: SLUGS } }, overrideAccess: true, req: args.req, context: { disableRevalidate: true } })
}
