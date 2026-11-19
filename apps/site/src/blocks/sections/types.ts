import type { Block } from 'payload'
import type { ReactNode } from 'react'

import type { PageSetId } from '@/lib/page-sets/registry'
import type { ThemeId } from '@/lib/page-themes/themes'

/** What every section's block data carries (the fields `sectionFields` adds), plus its own. */
export interface SectionData {
  id?: string | null
  blockType: string
  hidden?: boolean | null
  anchor?: string | null
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
}
