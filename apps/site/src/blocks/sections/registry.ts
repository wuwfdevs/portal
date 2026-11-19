import type { Block } from 'payload'

import { isPageSetId, type PageSetId } from '@/lib/page-sets/registry'

import { Cards } from './Cards/config'
import { CardsSection } from './Cards/Component'
import type { SectionBlockEntry } from './types'

/**
 * Every section block (PAGE-BLOCKS.md → Block catalogue). One entry per block, here and nowhere else: its definition (`config.ts`), its
 * component, and the page sets that offer it (none listed: a library block, offered on every `sections` page). A developer adds a block by
 * adding a directory under `blocks/sections/` and one entry here; `registry.test.ts` fails when a block lacks a component, a test, a
 * thumbnail or a picker group, or when a directory is not registered.
 *
 * The definitions are put in the config's root `blocks` once and listed by `blockReferences` on the pages field, so the same block can be
 * offered elsewhere without growing the config.
 */
export const SECTION_BLOCKS: readonly SectionBlockEntry[] = [{ dir: 'Cards', block: Cards, Component: CardsSection }]

/** The blocks for the config's root `blocks`. */
export const sectionBlockDefinitions: Block[] = SECTION_BLOCKS.map((e) => e.block)

const bySlug = new Map(SECTION_BLOCKS.map((e) => [e.block.slug, e]))

export function sectionEntry(slug: unknown): SectionBlockEntry | undefined {
  return typeof slug === 'string' ? bySlug.get(slug) : undefined
}

/** The slugs the picker offers a page in this set: the library, plus the blocks that name the set. */
export function blocksOfferedFor(set: unknown, entries: readonly SectionBlockEntry[] = SECTION_BLOCKS): string[] {
  const id: PageSetId | null = isPageSetId(set) ? set : null
  return entries.filter((e) => !e.sets || (id !== null && e.sets.includes(id))).map((e) => e.block.slug)
}

/** The slugs set-only blocks name: for a test that each names a set that exists. */
export function allSectionSlugs(entries: readonly SectionBlockEntry[] = SECTION_BLOCKS): string[] {
  return entries.map((e) => e.block.slug)
}
