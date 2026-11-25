import type { Block } from 'payload'
import type { ReactNode } from 'react'

import type { HubLoad } from '@/lib/listening/load'
import type { Media } from '@/payload-types'
import type { PageSetId } from '@/lib/page-sets/registry'
import type { ClaimRequest, SlotTiles } from '@/lib/page-slots'
import type { PlacementTile } from '@/lib/placements/tiles'
import type { ThemeId } from '@/lib/page-themes/themes'

/** What every section's block data carries (the fields `sectionFields` adds), plus its own. */
export interface SectionData {
  id?: string | null
  blockType: string
  hidden?: boolean | null
  anchor?: string | null
  /** A name for this section in the page strip (needs an anchor). */
  navLabel?: string | null
  /** A page the strip's link goes to instead of this section (a section that has a page of its own). */
  navHref?: string | null
  tone?: string | null
  variant?: string | null
  /** Set by Columns on a section it holds: draw without a band of its own (the band around the columns carries the tone and the spacing). */
  inline?: boolean
  heading?: { eyebrow?: string | null; title?: string | null; intro?: string | null } | null
}

/** What a page tells each section it is rendered on. A function of the page record, never of the request (PAGE-BLOCKS.md → Rendering). */
export interface SectionContext {
  themeId: ThemeId
  setId: PageSetId | null
  /** True when a signed-in editor is previewing a draft. */
  draft: boolean
  pageId: number | string | undefined
  /**
   * The production the page speaks for (`pages.show`), when it names one: a show's pages, and a hub that has a production (RadioLive). A show-aware block (episodes of "the show",
   * Support's attribution, the funder line) reads its facts from the production by this id and never from the page. Set from the page record, never from the request.
   */
  show?: { id: number | string }
  /**
   * The request's query string, handed in by a coded route that has to answer it per request (`/support/ways?way=`, `/support/thanks?name=`), as
   * the page-record renderer's one input from the request. `undefined` on every page the cached catch-all serves. A block reads it only from
   * here, never from the request itself (PAGE-BLOCKS.md → Rendering).
   */
  query?: Record<string, string | string[] | undefined>
  /**
   * What the Portal answered for the hub, loaded by the coded route that renders the Listens page per request (`/listens`; the Portal's rate limit needs the
   * reader's hashed address, which only the route may read). `undefined` on every page the cached catch-all serves: the Listens blocks then draw nothing.
   */
  listeningHub?: HubLoad
  /**
   * The sponsor tiles for the page's slots (`PageSetSpec.slots`), loaded by the coded route that renders the page (the home page's shell, which also holds the
   * top unit back during an emergency). `undefined` on every page the cached catch-all serves, and on a page whose set has no slots: nothing is drawn.
   */
  slots?: SlotTiles<PlacementTile<Media>>
  /**
   * The stories each section that lists stories was given by the page's ordered pass, by the section's id (`PageSetSpec.dedupe`). Set by `RenderSections`; absent
   * on a page that does not de-duplicate, where each section draws its own newest.
   */
  claims?: ReadonlyMap<string, readonly (string | number)[]>
}

export type SectionProps<B extends SectionData = SectionData> = { block: B; context: SectionContext }
/** A section's component: a server component, sync or async. It returns null when it has nothing to show. */
export type SectionComponent<B extends SectionData = never> = (props: SectionProps<B>) => ReactNode | Promise<ReactNode>

/** The groups the block picker sorts blocks into. */
export const SECTION_GROUPS = ['Lead', 'Layout', 'Collections', 'Facts and steps', 'Action', 'Text'] as const
export type SectionGroup = (typeof SECTION_GROUPS)[number]

export interface SectionBlockEntry {
  /** The directory under `blocks/sections/` that holds `config.ts`, `Component.tsx` and the test. */
  dir: string
  block: Block
  Component: SectionComponent<any>
  /** The page sets that offer this block. Absent: a library block, offered on every `sections` page. */
  sets?: readonly PageSetId[]
  /** Offered only inside Columns, never on a page's own list (a section that means nothing alone). */
  inlineOnly?: boolean
  /**
   * A section that lists stories and takes part in the page's ordered pass (a page set with `dedupe`): says which stories it would show, in order, how many it takes, and
   * which it pins. `RenderSections` asks every such section in the page's order, gives each the newest that nothing above took (`lib/page-slots`), and hands the answer
   * back as `context.claims`. A section that is not on such a page ignores all of it and draws its own.
   */
  claimRequest?: (block: any, context: SectionContext) => Promise<Omit<ClaimRequest, 'key'> | ReadonlyArray<Omit<ClaimRequest, 'key'> & { part: string }> | null>
  /**
   * The block draws the page's top unit itself, in its own layout (the Front page lead puts it between the lead and The Briefing on a phone, as the coded page does), so
   * `RenderSections` does not place it again. A page with no such block gets the top unit after its first section.
   */
  drawsTop?: boolean
  /**
   * A call to action drawn as a card (Support, Closing band). Two or more of these in a row on a page share one band, side by side on a wide screen (`RenderSections`), so the page never
   * has two full-width bands stacked. The component draws only its card when it is given `inline`.
   */
  cta?: boolean
  /** A news run: the page's sponsor rows sit above these, one row above each, as the home page's rail does. */
  anchor?: boolean
}
