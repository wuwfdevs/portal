// Types for the Grove converter: one Grove page (its `?_renderer=json` view) in, one story out, plus a report that
// says what happened to every part of it. Pure: no network, no database, no framework.

/** A Grove JSON value: the pages are untyped, so everything read from one is checked, never assumed. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
export type JsonObject = { [key: string]: Json }

/**
 * A reference to a file the story needs, to be copied into our own storage by the asset pipeline. Where the story
 * will point at the library record (a media or audio relationship) the converter leaves an `AssetToken` instead;
 * `resolveAssets` swaps tokens for library ids once the files are stored.
 */
export interface AssetRef {
  kind: 'image' | 'audio' | 'video'
  /** Absolute https address of the file as Grove serves it. The library matches on this (`legacy.sourceUrl`). */
  sourceUrl: string
  width?: number
  height?: number
  /** What Grove said about the file where it was used. The pipeline picks the library values from these. */
  alt?: string
  credit?: string
  source?: string
  title?: string
  description?: string
  durationSeconds?: number
  mimeType?: string
}

export interface AssetToken {
  $asset: string
}
export const isAssetToken = (v: unknown): v is AssetToken =>
  typeof v === 'object' && v !== null && typeof (v as AssetToken).$asset === 'string' && Object.keys(v).length === 1

/** A Lexical editor node (or block node), as plain JSON. */
export interface LexNode {
  type: string
  version: number
  [key: string]: unknown
}
export interface LexicalState {
  root: LexNode & { children: LexNode[] }
}
/** An item of a blocks field (featured media): the block's fields with its type and id. */
export interface BlockItem {
  id: string
  blockType: string
  [key: string]: unknown
}

export type ReportLevel =
  /** Kept in some other form (a link, preserved HTML) and flagged for a person to look at. */
  | 'preserved'
  /** Changed in a way that loses nothing of the content (formatting flattened, a field not carried); no action. */
  | 'noted'
  /** Could not be converted. The story must not be imported until a person decides. */
  | 'exception'

export interface ReportEntry {
  level: ReportLevel
  /** A stable, dotted code such as `embed.host-not-approved`. The corpus summary counts by code. */
  code: string
  detail?: string
}

export interface StoryReport {
  path: string
  groveId: string
  status: 'clean' | 'review' | 'exception'
  /** How many of each kind of element converted without trouble, e.g. `{ paragraph: 12, 'block:mediaBlock': 2 }`. */
  mapped: Record<string, number>
  entries: ReportEntry[]
}

export interface PersonRef {
  name: string
  title?: string
  /** From `/people/<slug>`. The importer finds or creates the contributor by it. */
  slug?: string
  bio?: string
  photo?: AssetToken
}

export interface ConvertedStory {
  legacy: { groveId: string; legacyPath: string; modifiedAt: string | null }
  /** The exact Grove path. Never recomputed. */
  path: string
  /** The last part of the path, kept as the story's slug so the address and the slug agree. */
  slug: string
  title: string
  publishedAt: string | null
  /** Grove's description is the SEO/teaser text; it becomes `meta.description`, not the story's dek. */
  description: string | null
  source: 'wuwf'
  section: { title: string; path: string | null } | null
  topics: { title: string; slug: string | null; groveId: string | null }[]
  byline: { people: PersonRef[]; text: string | null }
  featuredMedia: BlockItem[]
  featuredAudio: AssetToken | null
  content: LexicalState
  /** Every file the story uses (also found as tokens inside `content`, `featuredMedia` and `byline`). */
  assets: AssetRef[]
}

export type ConvertResult =
  | { status: 'converted'; story: ConvertedStory; report: StoryReport }
  | { status: 'skipped'; reason: 'external' | 'ambiguous' | 'not-an-article'; report: StoryReport }

export interface ConvertOptions {
  /** Hosts approved in Site settings for frames that are not a known provider. */
  embedHosts?: readonly string[]
}
