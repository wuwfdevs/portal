// Reading a visualization and its data out of Payload, as plain `VisualizationView`s. It takes the Payload instance it is given and imports
// neither the config nor Next's cache, so collections' hooks can use it (the config imports them) and `load.ts` can wrap it in the cache.
//
// Three ways to read (`ReadMode`), because the same record means different things to different people:
//   public  what a reader may see: published visualizations on published dataset versions. Access control is on.
//   staff   a signed-in editor previewing: drafts, and staged (unpublished) dataset versions. Access control is on, as that user.
//   system  a hook checking a save: everything, as the system. Never used for a page.

import type { Payload, PayloadRequest } from 'payload'

import { prepareSpec, validateSpec } from './engines'
import { snapshotOf, specOf, relationId } from './shape'
import type { SpecContext, VizSpec } from './spec'
import type { DatasetSnapshot } from './types'
import { chooseVersion, VERSION_PROBLEM } from './version'
import type { LoadedVisualization, VisualizationView } from './view'

export type ReadMode = { kind: 'public' } | { kind: 'staff'; user: unknown } | { kind: 'system' }

type Doc = Record<string, unknown>

const access = (mode: ReadMode) => ({
  overrideAccess: mode.kind === 'system',
  ...(mode.kind === 'staff' ? { user: mode.user as never } : {}),
  draft: mode.kind !== 'public',
})
const includesStaged = (mode: ReadMode) => mode.kind !== 'public'

export interface Reader {
  payload: Payload
  mode: ReadMode
  req?: PayloadRequest
  /** Hosts an administrator approved for embeds (Site settings). */
  embedHosts?: readonly string[]
}

/** The snapshot a visualization would draw from one dataset, or why there is none. */
export async function readSnapshot(
  r: Reader,
  datasetId: number | string,
  mode: 'latest' | 'pinned',
  pinned: number | string | null,
): Promise<{ ok: true; snapshot: DatasetSnapshot; dataset: Doc } | { ok: false; reason: string }> {
  const { payload, req } = r
  const refs = await payload.find({
    collection: 'dataset-versions',
    where: { dataset: { equals: datasetId } },
    sort: '-version',
    limit: 100,
    depth: 0,
    select: { version: true, published: true },
    ...access(r.mode),
    req,
  })
  const choice = chooseVersion(
    mode,
    pinned,
    refs.docs.map((d) => ({ id: d.id, version: Number((d as Doc).version), published: Boolean((d as Doc).published) })),
    includesStaged(r.mode),
  )
  if (!choice.ok) return { ok: false, reason: VERSION_PROBLEM[choice.reason] }
  const [version, dataset] = await Promise.all([
    payload.findByID({ collection: 'dataset-versions', id: choice.version.id, depth: 0, ...access(r.mode), req }),
    // A dataset's own record is staff-only. It is read here, by code that has already shown there is a version this reader may see, and only for
    // the few fields a figure prints.
    payload.findByID({ collection: 'datasets', id: datasetId, depth: 0, overrideAccess: true, select: { title: true, description: true, source: true, methodology: true }, req }),
  ])
  const snapshot = snapshotOf(version as unknown as Doc, { id: datasetId })
  if (!snapshot) return { ok: false, reason: 'The dataset version could not be read.' }
  return { ok: true, snapshot, dataset: dataset as unknown as Doc }
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** The visualization's configuration and the data it names, ready to validate or draw. */
export async function readContext(r: Reader, viz: Doc): Promise<{ spec: VizSpec | null; ctx: SpecContext | null; dataset: Doc | null; reason: string | null }> {
  const spec = specOf(viz)
  if (!spec) return { spec: null, ctx: null, dataset: null, reason: 'This visualization has an unknown type.' }
  if (spec.kind === 'embed') return { spec, ctx: null, dataset: null, reason: null }
  const datasetId = relationId(viz.dataset)
  if (datasetId === null) return { spec, ctx: null, dataset: null, reason: 'Choose a dataset.' }
  const main = await readSnapshot(r, datasetId, viz.dataMode === 'pinned' ? 'pinned' : 'latest', relationId(viz.pinnedVersion))
  if (!main.ok) return { spec, ctx: null, dataset: null, reason: main.reason }
  let boundary: DatasetSnapshot | null = null
  if (spec.kind === 'map' && spec.geometry === 'boundaries') {
    const map = (viz.map ?? {}) as Doc
    const boundaryId = relationId(map.boundaryDataset)
    if (boundaryId === null) return { spec, ctx: null, dataset: main.dataset, reason: 'Choose a GeoJSON dataset for the boundaries.' }
    const b = await readSnapshot(r, boundaryId, relationId(map.boundaryVersion) !== null ? 'pinned' : 'latest', relationId(map.boundaryVersion))
    if (!b.ok) return { spec, ctx: null, dataset: main.dataset, reason: `Boundaries: ${b.reason}` }
    boundary = b.snapshot
  }
  return { spec, ctx: { dataset: main.snapshot, boundary }, dataset: main.dataset, reason: null }
}

const kb = (n: number | null) => (n === null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

/** Read, validate and prepare one visualization. A figure that cannot be drawn is `ok: false` with the reason, never a half-drawn picture. */
export async function readVisualization(r: Reader, id: number | string): Promise<LoadedVisualization & { problems?: string[] }> {
  let viz: Doc | null = null
  try {
    viz = (await r.payload.findByID({ collection: 'visualizations', id, depth: 0, ...access(r.mode), req: r.req })) as unknown as Doc
  } catch (error) {
    if ((error as { status?: number }).status === 404 || (error as { status?: number }).status === 403) return { ok: false, reason: 'not found' }
    throw error
  }
  if (!viz) return { ok: false, reason: 'not found' }
  const { spec, ctx, dataset, reason } = await readContext(r, viz)
  if (!spec) return { ok: false, reason: reason ?? 'unreadable' }
  if (reason) return { ok: false, reason, problems: [reason] }
  const problems = validateSpec(spec, ctx, r.embedHosts ?? [])
  if (problems.length > 0) return { ok: false, reason: problems[0]!, problems }
  let model
  try {
    model = prepareSpec(spec, ctx ? { ...ctx, idPrefix: `viz${id}` } : null, `viz${id}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The visualization could not be drawn.'
    return { ok: false, reason: message, problems: [message] }
  }
  const snap = ctx?.dataset ?? null
  const own = (viz.source ?? {}) as Doc
  const fromDataset = ((dataset?.source ?? {}) as Doc)
  const sourceName = text(own.name) ?? text(fromDataset.name)
  const view: VisualizationView = {
    id,
    kind: spec.kind,
    title: text(viz.title) ?? 'Visualization',
    caption: text(viz.caption),
    altText: text(viz.altText) ?? '',
    source: sourceName ? { name: sourceName, url: text(own.url) ?? (text(own.name) ? null : text(fromDataset.url)) } : null,
    methodology: [text(dataset?.methodology), text(viz.notes)].filter((s): s is string => s !== null).join('\n\n') || null,
    data: snap
      ? { datasetTitle: text(dataset?.title) ?? 'Dataset', versionNumber: snap.versionNumber, versionLabel: snap.versionLabel, asOf: snap.publishedAt, pinned: viz.dataMode === 'pinned' }
      : null,
    download: snap?.file && viz.showDownload !== false ? { url: snap.file.url, filename: snap.file.filename, label: `Download the data (${snap.format === 'geojson' ? 'GeoJSON' : snap.format.toUpperCase()}${snap.file.filesize ? `, ${kb(snap.file.filesize)}` : ''})` } : null,
    model,
  }
  return { ok: true, view }
}

/**
 * Which published visualizations that follow `datasetId` (as their data, or as the shapes of a map) could no longer be drawn if `candidate` were its
 * latest version. A publisher is told before new data goes live, instead of a chart vanishing from a story afterwards.
 */
export async function visualizationsBrokenBy(r: Reader, datasetId: number | string, candidate: DatasetSnapshot): Promise<Array<{ id: number | string; title: string; problems: string[] }>> {
  const { payload, req } = r
  const found = await payload.find({
    collection: 'visualizations',
    where: { and: [{ _status: { equals: 'published' } }, { or: [{ and: [{ dataset: { equals: datasetId } }, { dataMode: { not_equals: 'pinned' } }] }, { 'map.boundaryDataset': { equals: datasetId } }] }] },
    limit: 200,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const broken: Array<{ id: number | string; title: string; problems: string[] }> = []
  for (const doc of found.docs as unknown as Doc[]) {
    const { spec, ctx, reason } = await readContext(r, doc)
    if (!spec || spec.kind === 'embed') continue
    const swap = (s: DatasetSnapshot | null, follows: boolean) => (follows && s && String(s.datasetId) === String(datasetId) ? candidate : s)
    const mainFollows = doc.dataMode !== 'pinned'
    const boundaryFollows = relationId(((doc.map ?? {}) as Doc).boundaryVersion) === null
    const next = ctx ? { dataset: swap(ctx.dataset, mainFollows)!, boundary: swap(ctx.boundary, boundaryFollows) } : null
    const problems = reason && !next ? [reason] : validateSpec(spec, next, r.embedHosts ?? [])
    if (problems.length > 0) broken.push({ id: doc.id as number | string, title: text(doc.title) ?? `#${doc.id}`, problems })
  }
  return broken
}
