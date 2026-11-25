// How a composed page carries its sponsor places and keeps a story from appearing twice. Pure.
//
// A page set can own SLOTS: places the page's layout draws for the zones in the registry (`lib/placements/registry.ts`), in the page's own positions, never placed by an
// editor among the sections (so a publisher cannot delete, hide or duplicate paid delivery, and the rule that a paid tile that runs is always drawn holds by construction).
// The home page set has two: the top unit and the rail (rows of three after every other news run, `lib/placements/flow.ts`). The slim band after the news was retired
// on 2026-11-25 (the homepage rethink): it sat directly after a row of tiles, two sponsor units back to back.
//
// A page can also ask that no story appear twice: sections that LIST stories claim them in the page's order, and a section left with nothing is left out.

import { flowHomeRail, type RowItem } from '@/lib/placements/flow'

type Id = string | number

export interface SlotTiles<T> {
  top: T | null
  rail: readonly T[]
  /** WUWF promotions that may complete a short last row (`flow.ts`). */
  fillers: readonly T[]
}

export interface SlotPlan<T> {
  top: T | null
  /** One entry per anchor section (a news run): the row of tiles drawn just after it, or null (every other run, from the first, has a place). */
  after: ReadonlyArray<RowItem<T>[] | null>
  /** Rows that did not fit after an anchor, drawn after the last one: a paid tile that runs is always drawn. */
  trailing: RowItem<T>[][]
}

/**
 * Where a page's tiles go: the rail's rows after its anchor sections as `flowHomeRail` sets them out, and the top unit where the page puts it. With no anchor the rail's
 * rows all follow the content, so a page with no news run still shows every tile that runs.
 */
export function planSlots<T>(tiles: SlotTiles<T>, anchors: number): SlotPlan<T> {
  const flow = flowHomeRail({ tiles: tiles.rail, fillers: tiles.fillers, sections: anchors })
  return { top: tiles.top, after: flow.after, trailing: flow.trailing }
}

export interface ClaimRequest {
  /** The section's own id: stable for the page. */
  key: string
  /** The stories it would show, in order (more than it takes, to absorb what an earlier section took). */
  candidates: readonly Id[]
  /** How many it takes. */
  take: number
  /** Stories it takes whatever came before, in order (a lead that an editor chose): they count first and are never dropped for being taken. */
  pinned?: readonly Id[]
}

/**
 * Hands each section its stories in the page's order: a section's pinned stories first, then the newest of its candidates that no earlier section took, up to its count.
 * `taken` is what the page already shows above (nothing, for a page that has no lead outside the sections). A section left with none gets an empty list.
 */
export function claimInOrder(requests: readonly ClaimRequest[], taken: readonly Id[] = []): Map<string, Id[]> {
  const seen = new Set(taken.map(String))
  const out = new Map<string, Id[]>()
  for (const r of requests) {
    const mine: Id[] = []
    for (const id of r.pinned ?? []) {
      if (mine.length >= Math.max(0, r.take)) break
      mine.push(id)
      seen.add(String(id))
    }
    for (const id of r.candidates) {
      if (mine.length >= Math.max(0, r.take)) break
      if (seen.has(String(id))) continue
      seen.add(String(id))
      mine.push(id)
    }
    out.set(r.key, mine)
  }
  return out
}
