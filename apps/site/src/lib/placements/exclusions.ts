// Where placements are held back, however an editor has set them up. Pure.
//
// A top unit is the most prominent thing a sponsor can buy, so it yields to the things a reader must see first: an emergency banner (the owner's rule, 2026-11-20:
// the banner always comes first, and no sponsor message sits near an emergency). A notice banner is quiet and does not hold a top unit back.

import type { BannerData } from '@/lib/banner'

/**
 * Whether the page's top units are held back. `place` is the page being drawn: a banner set for the home page holds back only the home page's unit, and one set
 * for every page holds back the unit on every page.
 */
export function topUnitHeldBack(banner: Pick<BannerData, 'scope' | 'style'> | null | undefined, place: 'home' | 'other'): boolean {
  if (!banner || banner.style !== 'emergency') return false
  return banner.scope === 'all' || place === 'home'
}

/** The parts of a story that decide whether it carries sponsor tiles. */
export interface StoryExclusionFields {
  format?: string | null
  membersOnly?: boolean | null
  /** An editor's "No sponsor messages on this story". */
  noPlacements?: boolean | null
}

/**
 * Whether a story page may draw its zones (`story.rail`, `story.inline`). Never in a live blog (readers are following something unfolding), never in a members-only
 * story (what a member gave for is not a place for a sponsor), and never where an editor has said a sponsor message would be wrong beside it. Underwriting lines are a
 * different system and are not affected by this: they are editorial acknowledgment, kept apart from placements (`PLACEMENTS.md`).
 */
export function storyZonesAllowed(story: StoryExclusionFields | null | undefined): boolean {
  if (!story) return false
  return story.format !== 'live' && story.membersOnly !== true && story.noPlacements !== true
}
