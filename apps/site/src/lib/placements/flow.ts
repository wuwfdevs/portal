// How the home page's running tiles are laid out down the page. Pure: it takes the tiles that run and says where each goes; a screen draws that.
//
// The tiles are one list, in the order editors set, laid out as ROWS of three, each row in a full-width tinted band (`SponsorBand`) with no side column. The rows sit
// BETWEEN THE NEWS, every other run (the homepage rethink, 2026-11-25, replacing a row above every run, which put sponsor rows between nearly every block):
//
//   - The first row follows the first news run, the next follows the third, then the fifth, and so on, so the news reads in pairs between sponsor bands. With the
//     home page's three runs (Local News, then Florida News and NPR News) that is a band after Local News and a band after NPR News: the zone's six.
//   - A row is three tiles. The last row, when it is short, is completed by WUWF's own promotions that editors have marked "can fill a gap"
//     (optional; at most two, since a row of three needs at most two). With none, the short row's tiles are centered at the same size, so it
//     still looks deliberate.
//   - Rows that do not fit after a run (more rows than places) follow the last run. A paid tile that runs is always drawn.
//
// Rows are centered, fixed-width tiles that wrap, so a row of three becomes two and one on a tablet and a stack on a phone with no arithmetic about
// how many columns a screen has; the page is cached and shared by every reader, and the server never needs to know a screen's width.

/** Tiles in a full row. */
export const ROW_SIZE = 3
/** The most fillers a row can ever need: a row of one tile. */
export const FILLER_MAX = ROW_SIZE - 1

export interface RowItem<T> {
  tile: T
  /** A WUWF promotion placed only to complete a row. */
  filler: boolean
}

export interface HomeFlow<T> {
  /** One entry per news run: the row of tiles drawn just after it, or null when it has none (every other run, from the first, has a place). */
  after: ReadonlyArray<RowItem<T>[] | null>
  /** Rows that did not fit after a run (there were more rows than places), drawn after the last one. */
  trailing: RowItem<T>[][]
}

/** Whether a row may follow the run at this position (from 0): the first, the third, the fifth... */
export const rowFollowsRun = (index: number): boolean => index >= 0 && index % 2 === 0

/**
 * @param tiles the tiles that run, in order, not counting fillers
 * @param fillers WUWF promotions marked as able to fill a gap, in order (may be empty)
 * @param sections how many news runs the page has
 */
export function flowHomeRail<T>(input: { tiles: readonly T[]; fillers: readonly T[]; sections: number }): HomeFlow<T> {
  const items: RowItem<T>[] = input.tiles.map((tile) => ({ tile, filler: false }))
  const rows: RowItem<T>[][] = []
  for (let i = 0; i < items.length; i += ROW_SIZE) rows.push(items.slice(i, i + ROW_SIZE))

  const last = rows[rows.length - 1]
  if (last && last.length < ROW_SIZE) {
    const use = Math.min(ROW_SIZE - last.length, FILLER_MAX, input.fillers.length)
    for (let j = 0; j < use; j++) last.push({ tile: input.fillers[j] as T, filler: true })
  }

  const sections = Math.max(0, Math.floor(input.sections))
  const places = Math.ceil(sections / 2)
  return { after: Array.from({ length: sections }, (_, i) => (rowFollowsRun(i) ? (rows[i / 2] ?? null) : null)), trailing: rows.slice(places) }
}
