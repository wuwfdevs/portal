// How the home page's running tiles are laid out down the page. Pure: it takes the tiles that run and says where each goes; a screen draws that.
//
// The tiles are one list, in the order editors set, and the list flows through the places the page offers, so no row is ever left half empty:
//
//   1. Each news section that is tall enough takes a PAIR of tiles beside it (two stacked beside the section on a wide screen, two across under it
//      on a tablet, stacked on a phone). A pair always fills its place, whatever the width, so there is never a lone tile with blank space next to it.
//   2. Whatever is left goes into the foot row, every tile of it. A paid tile is never held back to keep a grid tidy.
//   3. The foot row is four across on a wide screen, two across on a tablet and one on a phone, so a leftover count that does not fill its last row
//      is completed with WUWF's own promotions that editors have marked "can fill a gap". Those are optional: with none, the last row's tiles are
//      centered at the same size instead.
//
// The page is cached and shared by every reader, so the server cannot know a screen's width. Each filler is therefore given the narrowest width it
// is needed at, worked out from the count alone, and the screen shows or hides it with a breakpoint class.

/** The most fillers that can ever be needed: a row of four with one tile in it. */
export const FILLER_MAX = 3
/** A news section holds a pair of tiles beside it only when it has at least this many stories (fewer is shorter than two tiles). */
export const PAIR_MIN_STORIES = 3

export type FillerFrom = 'sm' | 'lg'

export interface FootItem<T> {
  tile: T
  /** A WUWF promotion placed only to complete a row. */
  filler: boolean
  /** The narrowest screen a filler is shown on: from a tablet (`sm`) or from a wide screen (`lg`). A paid tile is always shown. */
  from: FillerFrom | null
}

export interface HomeFlow<T> {
  /** One entry per news section: its pair of tiles, or null when it has none. */
  beside: ReadonlyArray<readonly [T, T] | null>
  /** The foot row: every tile that is left, then any fillers that complete its rows. Empty when nothing is left. */
  foot: FootItem<T>[]
}

/** Which news sections hold a pair: those with enough stories to be as tall as two tiles. */
export const holdsPair = (storyCount: number): boolean => storyCount >= PAIR_MIN_STORIES

/**
 * @param tiles the tiles that run, in order, not counting fillers
 * @param fillers WUWF promotions marked as able to fill a gap, in order (may be empty)
 * @param slots one flag per news section: whether it holds a pair
 */
export function flowHomeRail<T>(input: { tiles: readonly T[]; fillers: readonly T[]; slots: readonly boolean[] }): HomeFlow<T> {
  const queue = [...input.tiles]
  const beside = input.slots.map((holds): readonly [T, T] | null => {
    if (!holds || queue.length < 2) return null
    return [queue.shift() as T, queue.shift() as T]
  })

  const foot: FootItem<T>[] = queue.map((tile) => ({ tile, filler: false, from: null }))
  const n = foot.length
  if (n > 0) {
    const toFourAcross = (4 - (n % 4)) % 4
    const toTwoAcross = n % 2
    const use = Math.min(toFourAcross, FILLER_MAX, input.fillers.length)
    for (let j = 1; j <= use; j++) {
      foot.push({ tile: input.fillers[j - 1] as T, filler: true, from: j <= toTwoAcross ? 'sm' : 'lg' })
    }
  }
  return { beside, foot }
}
