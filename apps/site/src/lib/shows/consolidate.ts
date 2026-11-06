// Shows and their episodes at one pattern, `/shows/<slug>` (owner decision, 2026-11-04). Grove had two: `/show/<slug>` (the older
// template) and `/podcast/<slug>` (from December 2021), each with episodes under it at `/<that>/<YYYY-MM-DD>/<slug>`. The import keeps
// Grove's exact addresses; this is the plan for the one deliberate step that then moves them, each old address leaving a permanent
// redirect. Pure: the database half is `scripts/shows/consolidate-core.ts`.

type Id = string | number

/** Where every show lives. */
export const SHOWS_PREFIX = '/shows/'

/** Grove's two show addresses. Anything else (a section, a hub such as `/unearthing-florida`) is not a show address and is left alone. */
const GROVE_SHOW = /^\/(?:show|podcast)\/([^/]+)$/

/** `/show/<slug>` or `/podcast/<slug>` → `/shows/<slug>`; null for any other address (already moved, or not a Grove show address). */
export function consolidatedShowPath(path: string | null | undefined): string | null {
  const slug = path ? GROVE_SHOW.exec(path)?.[1] : undefined
  return slug ? `${SHOWS_PREFIX}${slug}` : null
}

/** An episode address under the show's old address, moved under its new one; null when the episode does not sit under the old address. */
export function movedEpisodePath(path: string | null | undefined, fromShow: string, toShow: string): string | null {
  if (!path || !path.startsWith(`${fromShow}/`)) return null
  return `${toShow}${path.slice(fromShow.length)}`
}

/** A new episode's address under its show: `/shows/<slug>/<YYYY-MM-DD>/<slug>`. Only for a show already at `/shows/...`. */
export function newEpisodePath(input: { showPath: string; date: string; slug: string }): string | null {
  if (!input.showPath.startsWith(SHOWS_PREFIX)) return null
  return `${input.showPath}/${input.date}/${input.slug}`
}

export interface ShowMove {
  id: Id
  from: string
  to: string
}

export interface ConsolidationPlan {
  moves: ShowMove[]
  /** Two Grove shows that would land on the same address (`/show/x` and `/podcast/x`). Neither is moved: a person decides. */
  clashes: { to: string; shows: { id: Id; from: string }[] }[]
}

/** Which shows move where. Shows already at `/shows/...`, and records with no Grove show address, are not in the plan. */
export function planShowMoves(shows: readonly { id: Id; path: string | null | undefined }[]): ConsolidationPlan {
  const byTarget = new Map<string, { id: Id; from: string }[]>()
  for (const s of shows) {
    const to = consolidatedShowPath(s.path)
    if (!to || !s.path) continue
    byTarget.set(to, [...(byTarget.get(to) ?? []), { id: s.id, from: s.path }])
  }
  const moves: ShowMove[] = []
  const clashes: ConsolidationPlan['clashes'] = []
  for (const [to, list] of byTarget) {
    if (list.length === 1) moves.push({ id: list[0]!.id, from: list[0]!.from, to })
    else clashes.push({ to, shows: list })
  }
  moves.sort((a, b) => a.from.localeCompare(b.from))
  return { moves, clashes }
}
