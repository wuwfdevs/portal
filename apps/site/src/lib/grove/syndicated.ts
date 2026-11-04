// Which of Grove's show pages are programs WUWF airs but does not make. Grove marks none of them: `nprShow` is false on every show page,
// Morning Edition and Fresh Air included, so the page alone cannot say. The list is the owner's knowledge (2026-11-04: the 29 national
// programs, and six more "from other providers"), kept here, tested, and applied by the show converter.
//
// A program that is not on the list is an original production. That is the safe default for a new show: it can carry an underwriting
// agreement and appears in the podcast directory, and an editor can change its kind in the admin.

export type ShowKind = 'original' | 'syndicated'

export const SYNDICATED_SHOW_SLUGS: ReadonlySet<string> = new Set([
  // NPR and its partners' national programs
  '1a', 'all-things-considered', 'morning-edition', 'weekend-edition', 'fresh-air', 'here-and-now', 'wait-wait-dont-tell-me', 'ted-radio-hour',
  'science-friday', 'on-the-media', 'this-american-life', 'the-world', 'marketplace', 'marketplace-weekend', 'living-on-earth', 'le-show',
  'selected-shorts', 'open-to-debate', 'travel-with-rick-steves', 'bbc-world', 'the-florida-roundup',
  // music programs from other providers
  'american-routes', 'echoes', 'hearts-of-space', 'jazz-at-lincoln-center', 'jazz-night-in-america', 'putumayo-world-music-hour', 'world-cafe',
  'jazz-after-hours',
  // the six the owner confirmed as syndicated "from other providers"
  'big-bands-and-jazz', 'musical-gumbo', 'jazz-happening-now', 'florida-frontiers', 'capital-report', 'the-thistle-shamrock',
])

export const showKindOf = (slug: string): ShowKind => (SYNDICATED_SHOW_SLUGS.has(slug) ? 'syndicated' : 'original')
