// Every fixed place on wuwf.org where a sponsor message or a house promotion can sit. The registry is code on purpose: a placement is part
// of the page's layout, so a developer adds one with the screen that draws it. What fills a placement (the picture, the link, the dates) is
// content, edited in the admin (`Placements` global) today and, later, resolved from the Portal's entitlements behind the same keys.
//
// Rules every placement follows (CLAUDE.md, "Decisions that are made"; the full design is `PLACEMENTS.md`):
// a fixed, labeled place sold directly, in the page's own flow. No leaderboard across the top of a page, no autoplay or sound, no pop-up,
// no third-party ad tag and no outside tracker. A sponsor tile says "Sponsor message"; a house promotion is not drawn as one.
//
// The key of one tile is `<placement>.<position>`, position counting from 1 (`home.rail.3`), and is the reference a booking will name.

export type PlacementId = 'home.rail' | 'home.band' | 'section.rail' | 'story.rail' | 'story.inline'

export interface PlacementSpec {
  id: PlacementId
  /** The name staff see. */
  name: string
  /** Where on the page, in words. */
  where: string
  shape: 'tiles' | 'band'
  /** The most tiles it holds. A band holds one: it is not a rotation. */
  max: number
  /** Recommended artwork, as pixels wide by tall. Proposed, not yet confirmed by corporate support (the sponsorship page prices the website "Banner" as unconfirmed). */
  artwork: { width: number; height: number }
  /** A phone's artwork for a band, when it differs. */
  phoneArtwork?: { width: number; height: number }
  /** The sponsorship product it sells (`Sponsorship` global, Digital page) by its current name. */
  product: string
  /** Whether a screen draws it today. A placement that is not built is designed (`PLACEMENTS.md`) and has no admin fields. */
  built: boolean
}

export const PLACEMENTS: Readonly<Record<PlacementId, PlacementSpec>> = {
  'home.rail': {
    id: 'home.rail',
    name: 'Home page rail',
    where: 'Beside the news on the home page; after the news on a phone.',
    shape: 'tiles',
    max: 10,
    artwork: { width: 880, height: 704 },
    product: 'Display ad',
    built: true,
  },
  'home.band': {
    id: 'home.band',
    name: 'Home page banner',
    where: 'A slim band after the news sections and before the podcasts, never above the news.',
    shape: 'band',
    max: 1,
    artwork: { width: 1200, height: 200 },
    phoneArtwork: { width: 800, height: 400 },
    product: 'Banner',
    built: true,
  },
  'section.rail': {
    id: 'section.rail',
    name: 'Section and topic pages rail',
    where: 'Beside the stories on a section, topic or reporter page.',
    shape: 'tiles',
    max: 4,
    artwork: { width: 880, height: 704 },
    product: 'Display ad',
    built: false,
  },
  'story.rail': {
    id: 'story.rail',
    name: 'Story page rail',
    where: 'Beside the story text on a wide screen; after the story on a phone. Never inside a members-only story.',
    shape: 'tiles',
    max: 2,
    artwork: { width: 880, height: 704 },
    product: 'Display ad',
    built: false,
  },
  'story.inline': {
    id: 'story.inline',
    name: 'Story page, between paragraphs',
    where: 'One band after the story\'s opening paragraphs; never in a live blog, never beside a sensitive story.',
    shape: 'band',
    max: 1,
    artwork: { width: 1200, height: 200 },
    phoneArtwork: { width: 800, height: 400 },
    product: 'Banner',
    built: false,
  },
}

/** The placements a screen draws today. */
export const BUILT_PLACEMENTS: readonly PlacementSpec[] = Object.values(PLACEMENTS).filter((p) => p.built)

/** The longest words-for-the-picture a tile takes: alt text is read aloud, so it is kept brief. */
export const TILE_ALT_MAX = 160

/** The reference of one tile: `home.rail.3` for the third tile of the home page rail. */
export function tileKey(placement: PlacementId, position: number): string {
  return `${placement}.${Math.max(1, Math.floor(position))}`
}

/** The artwork size in words, e.g. "880 × 704 pixels". */
export function artworkSize(a: { width: number; height: number }): string {
  return `${a.width} × ${a.height} pixels`
}
