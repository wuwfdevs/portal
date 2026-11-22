// What a page is given to draw: one visualization, fully prepared, with everything an honest figure carries (a caption, who made the data,
// how, and a way to get it). Plain JSON, so it can be cached and passed from a server component to a client one.

import type { VizKind } from './spec'
import type { PlainTable, RenderModel } from './engines/types'

export interface VisualizationView {
  id: number | string
  kind: VizKind
  title: string
  caption: string | null
  /** The description for people who cannot see it (required to publish). Not the caption: it says what the picture shows and what to take from it. */
  altText: string
  source: { name: string; url: string | null } | null
  /** Plain text; a blank line starts a new paragraph. */
  methodology: string | null
  /** What data this draws, for "Data as of". Null for an embed (its data is elsewhere). */
  data: { datasetTitle: string; versionNumber: number; versionLabel: string | null; asOf: string | null; pinned: boolean } | null
  download: { url: string; filename: string; label: string } | null
  model: RenderModel
}

export type { PlainTable }

export type LoadedVisualization =
  | { ok: true; view: VisualizationView }
  | { ok: false; reason: string }
