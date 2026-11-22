import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionBeforeDeleteHook, CollectionConfig } from 'payload'

import path from 'path'
import { APIError } from 'payload'
import { fileURLToPath } from 'url'

import { fieldRequires, requirePermission, userCan } from '../../access/permissions'
import { formatFromFilename, parseDataset } from '../../lib/dataviz/parse'
import { visualizationsBrokenBy } from '../../lib/dataviz/read'
import { revalidateTag } from '../../lib/revalidate'
import { snapshotOf } from '../../lib/dataviz/shape'
import { MAX_FILE_BYTES } from '../../lib/dataviz/types'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

type Loose = Record<string, unknown>

/**
 * One upload of a dataset: a CSV, JSON or GeoJSON file, read once when it is saved and then never changed. What the file said is kept (the file
 * itself, for the download; its parsed rows and columns, for drawing) so a visualization can stay on it for as long as it is wanted. A mistake is
 * fixed by uploading a new version, not by editing this one.
 *
 * It is read here and refused with a plain sentence if it is not what it claims: the editor learns at upload that row 14 has an extra comma, not
 * when a chart fails to draw. A version is staged (not published) until a publisher publishes it, and publishing is refused when it would break a
 * live visualization that follows the dataset.
 */
const readTheFile: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  if (operation === 'update') {
    // The file and what was read from it are fixed; only the label and whether it is published can change.
    if (req.file) throw new APIError('A version cannot be replaced. Upload a new version of the dataset instead.', 400, undefined, true)
    for (const key of ['dataset', 'version', 'format', 'rowCount', 'columns', 'data']) {
      if (key in data && key !== 'dataset') delete (data as Loose)[key]
    }
    if (data.dataset !== undefined && String((data.dataset as { id?: unknown })?.id ?? data.dataset) !== String(originalDoc?.dataset?.id ?? originalDoc?.dataset)) {
      throw new APIError('A version belongs to its dataset for good.', 400, undefined, true)
    }
    return data
  }
  if (!req.file) throw new APIError('Choose a file to upload.', 400, undefined, true)
  const name = String(req.file.name ?? '')
  const format = formatFromFilename(name)
  if (!format) throw new APIError('Upload a .csv, .json or .geojson file. For a spreadsheet, use Save As → CSV.', 400, undefined, true)
  if (req.file.data.length > MAX_FILE_BYTES) throw new APIError(`The file is larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.`, 400, undefined, true)
  const parsed = parseDataset(format, req.file.data.toString('utf8'))
  if (!parsed.ok) throw new APIError(`${name}: ${parsed.reason}`, 400, undefined, true)
  const datasetId = (data.dataset as { id?: unknown } | undefined)?.id ?? data.dataset
  if (datasetId === undefined || datasetId === null || datasetId === '') throw new APIError('Choose the dataset this is a version of.', 400, undefined, true)
  const newest = await req.payload.find({ collection: 'dataset-versions', where: { dataset: { equals: datasetId } }, sort: '-version', limit: 1, depth: 0, overrideAccess: true, req })
  data.version = (Number((newest.docs[0] as unknown as Loose | undefined)?.version) || 0) + 1
  data.format = parsed.dataset.format
  data.rowCount = parsed.dataset.table.rows.length
  data.columns = parsed.dataset.table.columns
  data.data = { rows: parsed.dataset.table.rows, geo: parsed.dataset.geo }
  return data
}

/** Going live: stamp the time, and refuse when a visualization that follows this dataset could no longer be drawn with it. */
const publishGuard: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  const publishing = data.published === true && originalDoc?.published !== true
  if (data.published !== true) return data
  if (publishing || operation === 'create') {
    data.publishedAt = originalDoc?.publishedAt ?? new Date().toISOString()
  }
  if (!publishing && operation !== 'create') return data
  const datasetId = (data.dataset as { id?: unknown } | undefined)?.id ?? data.dataset ?? originalDoc?.dataset?.id ?? originalDoc?.dataset
  const candidate = snapshotOf({ ...(originalDoc ?? {}), ...data, id: originalDoc?.id ?? 0 }, { id: datasetId as number | string })
  if (!candidate) return data
  const broken = await visualizationsBrokenBy({ payload: req.payload, mode: { kind: 'system' }, req }, datasetId as number | string, candidate)
  if (broken.length > 0) {
    const list = broken.map((b) => `"${b.title}" (${b.problems[0]})`).join('; ')
    throw new APIError(`Publishing this version would break ${broken.length} live visualization${broken.length === 1 ? '' : 's'}: ${list}. Fix or pin ${broken.length === 1 ? 'it' : 'them'} first, or keep this version unpublished.`, 409, undefined, true)
  }
  return data
}

const refuseDeleteWhenPinned: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const used = await req.payload.find({
    collection: 'visualizations',
    where: { or: [{ pinnedVersion: { equals: id } }, { 'map.boundaryVersion': { equals: id } }] },
    limit: 5,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (used.totalDocs > 0) {
    throw new APIError(`${used.totalDocs} visualization${used.totalDocs === 1 ? ' is' : 's are'} pinned to this version (${used.docs.map((d) => `"${(d as unknown as Loose).title ?? d.id}"`).join(', ')}). Move ${used.totalDocs === 1 ? 'it' : 'them'} to another version first.`, 409, undefined, true)
  }
}

const refreshWhatDraws: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (req.context?.disableRevalidate) return doc
  // Only a change a reader can see: a version going live, or a live version being withdrawn or relabelled.
  if (!doc.published && !previousDoc?.published) return doc
  const datasetId = (doc.dataset as { id?: unknown } | undefined)?.id ?? doc.dataset
  const found = await req.payload.find({
    collection: 'visualizations',
    where: { or: [{ dataset: { equals: datasetId } }, { 'map.boundaryDataset': { equals: datasetId } }, { pinnedVersion: { equals: doc.id } }] },
    limit: 500,
    depth: 0,
    overrideAccess: true,
    select: { title: true },
    req,
  })
  for (const v of found.docs) revalidateTag(`viz:${v.id}`)
  return doc
}

export const DatasetVersions: CollectionConfig = {
  slug: 'dataset-versions',
  labels: { singular: 'Dataset version', plural: 'Dataset versions' },
  access: {
    create: requirePermission('content.write'),
    // The public reads a version only once it is published, which is also what lets the data download work from its address.
    read: ({ req }) => (userCan(req.user as never, 'content.write') ? true : { published: { equals: true } }),
    update: requirePermission('content.write'),
    delete: requirePermission('content.publish'),
  },
  admin: {
    useAsTitle: 'filename',
    defaultColumns: ['dataset', 'version', 'label', 'format', 'rowCount', 'published'],
    description: 'Every upload of every dataset. You normally add one from the dataset itself.',
  },
  defaultSort: '-createdAt',
  indexes: [{ fields: ['dataset', 'version'], unique: true }],
  fields: [
    { name: 'dataset', type: 'relationship', relationTo: 'datasets', required: true, index: true, admin: { description: 'The dataset this is a version of. Fixed once saved.' } },
    { name: 'version', type: 'number', admin: { readOnly: true, position: 'sidebar', description: 'Counted up automatically.' } },
    { name: 'label', type: 'text', admin: { description: 'What changed, e.g. "Through October 2026" or "Corrected the Santa Rosa row". Shown to readers as the data\'s version note.' } },
    {
      name: 'published',
      type: 'checkbox',
      defaultValue: false,
      access: { create: fieldRequires('content.publish'), update: fieldRequires('content.publish') },
      admin: {
        position: 'sidebar',
        description: 'A staged version can be previewed in a visualization but readers do not see it. Only a publisher can publish it. Every visualization that follows the latest data then updates.',
      },
    },
    { name: 'publishedAt', type: 'date', admin: { readOnly: true, position: 'sidebar', date: { pickerAppearance: 'dayAndTime' }, description: 'Set when it is published: this is the "data as of" date readers see.' } },
    { name: 'format', type: 'select', options: ['csv', 'json', 'geojson'], admin: { readOnly: true, position: 'sidebar' } },
    { name: 'rowCount', type: 'number', admin: { readOnly: true, position: 'sidebar' } },
    {
      name: 'columns',
      type: 'json',
      admin: { readOnly: true, description: 'The columns found in the file, and what each holds. Visualizations choose from these.' },
    },
    {
      // The parsed rows (and geometry): what a figure draws from, so drawing never depends on reading the file back from storage.
      name: 'data',
      type: 'json',
      admin: { hidden: true },
    },
  ],
  hooks: {
    beforeChange: [readTheFile, publishGuard],
    afterChange: [refreshWhatDraws],
    beforeDelete: [refuseDeleteWhenPinned],
  },
  upload: {
    staticDir: path.resolve(dirname, '../../../public/datasets'),
    // No `mimeTypes` list: browsers disagree about what a CSV is (text/csv, application/vnd.ms-excel, text/plain), and Payload's content sniffing
    // cannot tell a text format from another. The file's extension is checked in `readTheFile`, and what it holds by parsing it.
    // (Payload still refuses executable and script file types.)
  },
}

