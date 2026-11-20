// Every fixed ZONE on wuwf.org where a sponsor message or a house promotion can sit. A zone is part of a page's layout, so it is code: a
// developer adds one with the screen that draws it. What runs in a zone is content, and is made by editors in the admin as PLACEMENTS
// (the `placement-items` collection): which zone, who for, what picture, where it goes, when it runs, and, for zones that allow it, on which
// sections, topics or reporters it appears. A new placement, a different mix, a rethink of the packaging: none of it needs a deploy.
//
// What a zone guarantees whatever an editor configures (CLAUDE.md, "Decisions that are made"; the design is `PLACEMENTS.md`):
// a fixed, labeled place sold directly at a flat rate. No autoplay or sound, no pop-up, no ad-network tag, no third-party tracking. A top unit
// is allowed (owner, 2026-11-20), but only as the one unit of `home.top` / `list.top`: never above an emergency banner, never a script. A sponsor
// tile says "Sponsor message"; a house promotion is not drawn as one. The site knows nothing about packages, prices or how a placement was sold.
//
// The key of one tile on a page is `<zone>.<position>`, position counting from 1 (`home.rail.3`), and is the reference a booking will name.

export type ZoneId = 'home.top' | 'home.rail' | 'home.band' | 'list.top' | 'list.rail' | 'story.rail' | 'story.inline'

/** The kind of page a zone is on. A zone on the home page has no targets; a zone on a list page can be aimed at sections, topics or reporters. */
export type ZonePage = 'home' | 'list' | 'story'

export interface ZoneSpec {
  id: ZoneId
  /** The name staff see. */
  name: string
  /** Where on the page, in words. */
  where: string
  page: ZonePage
  shape: 'tiles' | 'band'
  /** The most tiles it holds on one page. A band holds one: it is not a rotation. */
  capacity: number
  /** Whether a placement can choose which pages of this kind it appears on (sections, topics, reporters). */
  targetable: boolean
  /** Recommended artwork, as pixels wide by tall. Proposed, not yet confirmed by corporate support. */
  artwork: { width: number; height: number }
  /** A phone's artwork for a band, when it differs. */
  phoneArtwork?: { width: number; height: number }
  /**
   * One sponsor owns the place for a stretch of dates (a top unit). The admin refuses a second placement whose dates overlap one already running
   * in the same place and aimed at the same page (`conflicts.ts`), so an exclusive that was sold is never shared.
   */
  exclusive?: boolean
  /** A top unit: drawn once, directly under the header and the banner, and held back while an emergency banner is on (`exclusions.ts`). */
  top?: boolean
  /** Whether a screen draws it today. A zone that is not built is designed (`PLACEMENTS.md`) and cannot be chosen in the admin. */
  built: boolean
}

/** The standard billboard, in pixels: the one shape a top unit may take, and the tallest. A top unit is never taller than this ratio (a test holds it). */
export const TOP_UNIT_ARTWORK = { width: 970, height: 250 } as const
export const TOP_UNIT_PHONE_ARTWORK = { width: 800, height: 400 } as const

export const ZONES: Readonly<Record<ZoneId, ZoneSpec>> = {
  'home.top': {
    id: 'home.top',
    name: 'Home page top unit',
    where: 'Directly under the header on the home page (on a phone, just under the lead story\'s headline and picture). Held back while an emergency banner is on.',
    page: 'home',
    shape: 'band',
    capacity: 1,
    targetable: false,
    artwork: TOP_UNIT_ARTWORK,
    phoneArtwork: TOP_UNIT_PHONE_ARTWORK,
    exclusive: true,
    top: true,
    built: true,
  },
  'home.rail': {
    id: 'home.rail',
    name: 'Home page rail',
    where: 'Beside the news on the home page; after the news on a phone.',
    page: 'home',
    shape: 'tiles',
    capacity: 9,
    targetable: false,
    artwork: { width: 880, height: 704 },
    built: true,
  },
  'home.band': {
    id: 'home.band',
    name: 'Home page banner',
    where: 'A slim band after the news sections and before the podcasts, never above the news.',
    page: 'home',
    shape: 'band',
    capacity: 1,
    targetable: false,
    artwork: { width: 1200, height: 200 },
    phoneArtwork: { width: 800, height: 400 },
    built: true,
  },
  'list.top': {
    id: 'list.top',
    name: 'Section, topic, reporter and all-stories pages: top unit',
    where: 'Under the title of a section, topic, reporter or all-stories page, before the stories. A section\'s presenting sponsor. Held back while an emergency banner is on.',
    page: 'list',
    shape: 'band',
    capacity: 1,
    targetable: true,
    artwork: TOP_UNIT_ARTWORK,
    phoneArtwork: TOP_UNIT_PHONE_ARTWORK,
    exclusive: true,
    top: true,
    built: true,
  },
  'list.rail': {
    id: 'list.rail',
    name: 'Section, topic, reporter and all-stories pages: rail',
    where: 'Beside the stories on a section, topic, reporter or all-stories page; after them on a phone.',
    page: 'list',
    shape: 'tiles',
    capacity: 4,
    targetable: true,
    artwork: { width: 880, height: 704 },
    built: true,
  },
  'story.rail': {
    id: 'story.rail',
    name: 'Story page rail',
    where: 'Beside the story text on a wide screen; after the story on a phone. Never inside a members-only story.',
    page: 'story',
    shape: 'tiles',
    capacity: 2,
    targetable: true,
    artwork: { width: 880, height: 704 },
    built: false,
  },
  'story.inline': {
    id: 'story.inline',
    name: 'Story page, between paragraphs',
    where: "One band after the story's opening paragraphs; never in a live blog, never beside a sensitive story.",
    page: 'story',
    shape: 'band',
    capacity: 1,
    targetable: true,
    artwork: { width: 1200, height: 200 },
    phoneArtwork: { width: 800, height: 400 },
    built: false,
  },
}

/** The zones a screen draws today: the ones an editor may choose. */
export const BUILT_ZONES: readonly ZoneSpec[] = Object.values(ZONES).filter((z) => z.built)

export const isZoneId = (v: unknown): v is ZoneId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(ZONES, v)

/** The longest words-for-the-picture a tile takes: alt text is read aloud, so it is kept brief. */
export const TILE_ALT_MAX = 160

/** The reference of one tile: `home.rail.3` for the third tile of the home page rail. */
export function tileKey(zone: ZoneId, position: number): string {
  return `${zone}.${Math.max(1, Math.floor(position))}`
}

/** The artwork size in words, e.g. "880 × 704 pixels". */
export function artworkSize(a: { width: number; height: number }): string {
  return `${a.width} × ${a.height} pixels`
}
