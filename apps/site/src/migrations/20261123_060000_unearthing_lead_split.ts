import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Unearthing Florida's lead is two columns (hubs redesign, 2026-11-23). Stacked, the episode's picture ran the width of the page under the headline and pushed the actions and the page's
 * first screen's content down; the words and the picture now sit side by side (Feature's split). A split's headline is a section heading unless it is marked as the page's title, and this is
 * the top of the page, so it is marked (`pageTitle`). `lib/unearthing/to-sections.ts` writes this shape for a database built from the migrations; this changes the page that
 * `20261123_013300_unearthing_home_page` already wrote (staging), and only its lead, by id. `20261123_050000_unearthing_lead_episode` is already pushed and is not edited.
 *
 * Nothing is written where there is no such page, and a lead that is already a split is left alone, so a re-run changes nothing. The lead's typed words and buttons are untouched. `down` makes the
 * lead a hero again and clears the mark (a merged block keeps every stored field, so the field is set false rather than removed).
 */
const SHOW_PATH = '/shows/unearthing-florida'
const LEAD = 'uf-lead'

type Section = Record<string, unknown> & { id?: string; blockType?: string }

async function change(args: MigrateUpArgs | MigrateDownArgs, edit: (lead: Section) => Section | null): Promise<void> {
  const { payload, req } = args
  const show = (await payload.find({ collection: 'productions', where: { path: { equals: SHOW_PATH } }, limit: 1, depth: 0, overrideAccess: true, req })).docs[0]
  if (!show) return
  const page = (await payload.find({ collection: 'pages', where: { and: [{ show: { equals: show.id } }, { isShowHome: { equals: true } }] }, limit: 1, depth: 0, draft: false, overrideAccess: true, req })).docs[0]
  if (!page) return
  let changed = false
  const sections = ((page.sections ?? []) as unknown as Section[]).map((s) => {
    if (s.id !== LEAD || s.blockType !== 'sectionFeature') return s
    const next = edit(s)
    if (!next) return s
    changed = true
    return next
  })
  if (!changed) return
  await payload.update({ collection: 'pages', id: page.id, data: { sections } as never, draft: false, overrideAccess: true, req, context: { disableRevalidate: true } })
}

export async function up(args: MigrateUpArgs): Promise<void> {
  await change(args, (lead) => (lead.variant === 'split' && lead.pageTitle === true ? null : { ...lead, variant: 'split', pageTitle: true }))
}

export async function down(args: MigrateDownArgs): Promise<void> {
  await change(args, (lead) => (lead.variant === 'split' && lead.pageTitle === true ? { ...lead, variant: 'hero', pageTitle: false } : null))
}
