import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Unearthing Florida's lead follows the show's newest episode (hubs redesign, 2026-11-23). The page strip already names the show, and the lead's headline said it again; with "Lead with the show's
 * latest episode" ticked, the lead is the newest episode (date, title, description, picture, play button) and the typed words are only what shows while the show has no episode. The show's summary,
 * which the lead used to carry, becomes the intro of the Explore heading. `lib/unearthing/to-sections.ts` writes this shape for a database built from the migrations; this changes the page that
 * `20261123_013300_unearthing_home_page` already wrote (staging), and only the two sections it names, by id.
 *
 * Nothing is written where there is no such page (production before launch, a new station), and a lead that already follows the episodes is left alone, so a re-run changes nothing. An editor's own
 * words on either section are kept: the lead's typed fields stay, and an Explore heading that already has an intro keeps it. Through the Local API: a merged block keeps every stored field, so
 * `playLatest` is set to false (the block would draw one play button either way) rather than removed.
 *
 * `down` turns the lead back to "Play the latest" and empties the Explore intro this wrote.
 */
const SHOW_PATH = '/shows/unearthing-florida'
const LEAD = 'uf-lead'
const EXPLORE = 'uf-explore'

type Section = Record<string, unknown> & { id?: string; blockType?: string; heading?: Record<string, unknown> | null }

async function homePage({ payload, req }: MigrateUpArgs | MigrateDownArgs) {
  const show = (await payload.find({ collection: 'productions', where: { path: { equals: SHOW_PATH } }, limit: 1, depth: 0, overrideAccess: true, req })).docs[0]
  if (!show) return null
  const page = (await payload.find({ collection: 'pages', where: { and: [{ show: { equals: show.id } }, { isShowHome: { equals: true } }] }, limit: 1, depth: 0, draft: false, overrideAccess: true, req })).docs[0]
  return page ? { show, page } : null
}

export async function up(args: MigrateUpArgs): Promise<void> {
  const found = await homePage(args)
  if (!found) return
  const { show, page } = found
  const summary = typeof show.summary === 'string' && show.summary.trim() !== '' ? show.summary.trim() : null
  let changed = false
  const sections = ((page.sections ?? []) as unknown as Section[]).map((s) => {
    if (s.id === LEAD && s.blockType === 'sectionFeature' && s.latestEpisode !== true) {
      changed = true
      return { ...s, latestEpisode: true, playLatest: false }
    }
    if (s.id === EXPLORE && s.blockType === 'sectionExplore' && summary && !(typeof s.heading?.intro === 'string' && s.heading.intro.trim() !== '')) {
      changed = true
      return { ...s, heading: { ...(s.heading ?? {}), intro: summary } }
    }
    return s
  })
  if (!changed) return
  await args.payload.update({ collection: 'pages', id: page.id, data: { sections } as never, draft: false, overrideAccess: true, req: args.req, context: { disableRevalidate: true } })
}

export async function down(args: MigrateDownArgs): Promise<void> {
  const found = await homePage(args)
  if (!found) return
  const { page } = found
  const summary = typeof found.show.summary === 'string' ? found.show.summary.trim() : ''
  let changed = false
  const sections = ((page.sections ?? []) as unknown as Section[]).map((s) => {
    if (s.id === LEAD && s.blockType === 'sectionFeature' && s.latestEpisode === true) {
      changed = true
      return { ...s, latestEpisode: false, playLatest: true }
    }
    // Only the intro this wrote (the show's summary) is emptied; words an editor typed there stay.
    if (s.id === EXPLORE && s.blockType === 'sectionExplore' && summary && s.heading?.intro === summary) {
      changed = true
      return { ...s, heading: { ...s.heading, intro: '' } }
    }
    return s
  })
  if (!changed) return
  await args.payload.update({ collection: 'pages', id: page.id, data: { sections } as never, draft: false, overrideAccess: true, req: args.req, context: { disableRevalidate: true } })
}
