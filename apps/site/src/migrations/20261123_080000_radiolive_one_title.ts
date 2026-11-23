import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * RadioLive's page has one title and an ordinary Encores band (hubs redesign, 2026-11-23). The Encores band was a hero Feature, whose headline is the page's h1 at 56px: far too large for a band
 * with a sentence and a button, and the only reason it was a hero was that the lead (a split) could not be the page's title. The lead is now marked as the title (`pageTitle`, as Unearthing's
 * is) and Encores is a split with no picture, a section heading with its sentence and button. `lib/radiolive/to-sections.ts` writes this shape for a database built from the migrations; this
 * changes the page `20261123_020000_radiolive_page` already wrote (staging), and only those two sections, by id.
 *
 * Nothing is written where there is no such page, a value that is already right is left alone (a re-run changes nothing), and every other field of the two sections is untouched. `down` makes the
 * lead a plain split again and Encores a hero.
 */
type Section = Record<string, unknown> & { id?: string; blockType?: string }

async function change(args: MigrateUpArgs | MigrateDownArgs, edit: (s: Section) => Section | null): Promise<void> {
  const found = await args.payload.find({ collection: 'pages', where: { and: [{ slug: { equals: 'radiolive' } }, { pageSet: { equals: 'radiolive' } }] }, limit: 1, depth: 0, draft: false, overrideAccess: true, req: args.req })
  const page = found.docs[0]
  if (!page) return
  let changed = false
  const sections = ((page.sections ?? []) as unknown as Section[]).map((s) => {
    if (s.blockType !== 'sectionFeature' || (s.id !== 'rl-lead' && s.id !== 'rl-encores')) return s
    const next = edit(s)
    if (!next) return s
    changed = true
    return next
  })
  if (!changed) return
  await args.payload.update({ collection: 'pages', id: page.id, data: { sections } as never, draft: false, overrideAccess: true, req: args.req, context: { disableRevalidate: true } })
}

export async function up(args: MigrateUpArgs): Promise<void> {
  await change(args, (s) => {
    if (s.id === 'rl-lead') return s.pageTitle === true ? null : { ...s, pageTitle: true }
    return s.variant === 'hero' ? { ...s, variant: 'split' } : null
  })
}

export async function down(args: MigrateDownArgs): Promise<void> {
  await change(args, (s) => {
    if (s.id === 'rl-lead') return s.pageTitle === true ? { ...s, pageTitle: false } : null
    return s.variant === 'split' ? { ...s, variant: 'hero' } : null
  })
}
