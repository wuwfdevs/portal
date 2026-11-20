import { pageSetOf } from '@/lib/page-sets/registry'

import type { SectionContext } from './types'

/**
 * The page's top-unit tile for a block that lays it out itself: only on a page whose set allows placements and has slots, and only when the coded route loaded tiles.
 * Anywhere else (the catch-all's cached pages, a page in another set) it is null and the block draws no unit.
 */
export function topUnitOf(context: SectionContext): NonNullable<SectionContext['slots']>['top'] {
  const set = pageSetOf(context.setId)
  return set?.placements && set.slots ? (context.slots?.top ?? null) : null
}
