import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionBeforeChangeHook, CollectionConfig, Field, TextFieldSingleValidation } from 'payload'

import { APIError } from 'payload'

import { publishedOrContentStaff, requirePermission } from '../../access/permissions'
import { enforcePublishPermission } from '../../hooks/enforcePublishPermission'
import { CHART_TYPES, MAX_CLASSES, MIN_CLASSES, DEFAULT_PAGE_SIZE } from '../../lib/dataviz/spec'
import { readContext } from '../../lib/dataviz/read'
import { validateSpec } from '../../lib/dataviz/engines'
import { isHttpsAddress } from '../../lib/network/original'
import { revalidateTag } from '../../lib/revalidate'
import { generateDataPreviewPath } from '../../utilities/generatePreviewPath'
import { valueFormatField } from './fields'

type Loose = Record<string, unknown>

const only =
  (kind: string) =>
  (data: Loose | undefined): boolean =>
    data?.kind === kind

/** A field whose value is a column of the chosen dataset. The editor picks from the dataset's columns (`ColumnSelect`), never types one. */
const columnField = (name: string, label: string, opts: { types?: Array<'number' | 'string' | 'date' | 'boolean'>; description?: string; hasMany?: boolean; required?: boolean } = {}): Field => ({
  name,
  type: 'text',
  label,
  ...(opts.hasMany ? { hasMany: true } : {}),
  admin: {
    description: opts.description,
    components: { Field: '@/components/admin/ColumnSelect#ColumnSelect' },
    custom: { columnTypes: opts.types ?? [], source: name === 'boundaryKey' ? 'boundaries' : 'dataset' },
  },
})

const chartFields: Field[] = [
  { name: 'type', type: 'select', required: true, defaultValue: 'line', options: CHART_TYPES.map((t) => ({ label: t.label, value: t.value })) },
  columnField('x', 'Horizontal axis (x)', { description: 'Usually a date, a year or a category. For a scatter plot, a number.' }),
  columnField('y', 'Values (y)', {
    types: ['number'],
    hasMany: true,
    description: 'One column draws one series. Several columns (like Cases and Deaths) draw one series each, side by side, up to six.',
  }),
  columnField('series', 'Split into series by', { description: 'Optional. A column whose values become separate series (one line per county). Use this or several value columns, not both.' }),
  {
    type: 'row',
    fields: [
      { name: 'xLabel', type: 'text', label: 'Horizontal axis label', admin: { width: '50%' } },
      { name: 'yLabel', type: 'text', label: 'Value axis label', admin: { width: '50%', description: 'Include the unit: "Cases per 100,000 people".' } },
    ],
  },
  valueFormatField('yFormat', 'How values are written'),
  { name: 'zeroBaseline', type: 'checkbox', label: 'Start the value scale at zero', admin: { description: 'Leave unticked to use the usual choice: zero for columns, bars and areas, the data\'s own range for lines and scatter plots.' } },
  {
    name: 'sort',
    type: 'select',
    defaultValue: 'data',
    options: [
      { label: 'As in the data', value: 'data' },
      { label: 'Largest first', value: 'valueDesc' },
      { label: 'Smallest first', value: 'valueAsc' },
    ],
    admin: { description: 'Columns and bars only.', condition: (_, sibling) => sibling?.type === 'column' || sibling?.type === 'bar' },
  },
]

const mapFields: Field[] = [
  {
    name: 'geometry',
    type: 'select',
    required: true,
    defaultValue: 'boundaries',
    options: [
      { label: 'Colour areas by a value (a table, joined to a boundary file)', value: 'boundaries' },
      { label: 'Draw the shapes in a GeoJSON dataset', value: 'dataset' },
      { label: 'Mark places (rows with a latitude and a longitude)', value: 'points' },
    ],
  },
  {
    name: 'boundaryDataset',
    type: 'relationship',
    relationTo: 'datasets',
    label: 'Boundary dataset (GeoJSON)',
    admin: { allowCreate: true, allowEdit: true, condition: (_, s) => s?.geometry === 'boundaries', description: 'The shapes: counties, ZIP codes, districts. Choose a GeoJSON dataset, or press + to add one here.' },
  },
  {
    name: 'boundaryVersion',
    type: 'relationship',
    relationTo: 'dataset-versions',
    label: 'Pin the boundaries to a version',
    filterOptions: ({ siblingData }) => ({ dataset: { equals: (siblingData as Loose)?.boundaryDataset as number } }),
    admin: { condition: (_, s) => s?.geometry === 'boundaries', description: 'Optional. Blank: the newest published boundaries.' },
  },
  columnField('joinColumn', 'Match places by this column', { description: 'The column in the table that names each place: the county name or its FIPS code.' }),
  columnField('boundaryKey', '…to this property of the boundaries', { description: 'The boundary file\'s own name or code for each place. Names are matched ignoring case and the word "County"; codes ignoring leading zeros.' }),
  columnField('latColumn', 'Latitude column', { types: ['number'] }),
  columnField('lonColumn', 'Longitude column', { types: ['number'] }),
  columnField('valueColumn', 'Colour by', { types: ['number'], description: 'A number. Areas are coloured in equal steps from light to dark. Leave blank to draw the shapes in one colour.' }),
  columnField('labelColumn', 'Name each place by', { description: 'Shown on hover, and in the data table.' }),
  {
    type: 'row',
    fields: [
      { name: 'classes', type: 'number', min: MIN_CLASSES, max: MAX_CLASSES, defaultValue: 5, admin: { width: '33%', description: `Colour steps, ${MIN_CLASSES} to ${MAX_CLASSES}.` } },
      { name: 'legendTitle', type: 'text', admin: { width: '67%', description: 'What the colours mean, with the unit: "Cases per 100,000".' } },
    ],
  },
  valueFormatField('valueFormat', 'How values are written'),
  {
    name: 'interactive',
    type: 'checkbox',
    label: 'Offer a pan-and-zoom map',
    defaultValue: false,
    admin: { description: 'Adds an "Explore the map" button. The drawing is always on the page; the interactive map loads only when a reader asks for it. Needs simplified shapes.' },
  },
]

const tableFields: Field[] = [
  {
    name: 'columns',
    type: 'array',
    labels: { singular: 'Column', plural: 'Columns' },
    admin: { description: 'Leave empty to show every column in the file\'s order.', initCollapsed: true },
    fields: [
      columnField('column', 'Column'),
      { name: 'label', type: 'text', admin: { description: 'The heading to show, if not the file\'s.' } },
      valueFormatField('format', 'How numbers are written'),
    ],
  },
  columnField('sortColumn', 'Start sorted by'),
  { name: 'sortDirection', type: 'select', defaultValue: 'asc', options: [{ label: 'Lowest first', value: 'asc' }, { label: 'Highest first', value: 'desc' }] },
  { name: 'searchable', type: 'checkbox', label: 'Let readers search it', defaultValue: false },
  { name: 'pageSize', type: 'number', min: 5, max: 100, defaultValue: DEFAULT_PAGE_SIZE, admin: { description: 'Rows per page.' } },
]

const embedFields: Field[] = [
  {
    name: 'url',
    type: 'text',
    label: 'Address of the chart or map',
    admin: { description: 'The embed address from Datawrapper, Flourish, ArcGIS or another approved site. It is shown through the same safe frame as any embed.' },
  },
  {
    type: 'row',
    fields: [
      { name: 'width', type: 'number', min: 1, max: 4000, admin: { width: '50%', description: 'Optional: the original width, to keep proportions.' } },
      { name: 'height', type: 'number', min: 1, max: 4000, admin: { width: '50%', description: 'Optional: the original height.' } },
    ],
  },
]

/**
 * Publishing is where a figure is held to what a reader is owed: it must be drawable from its data, say what it shows for someone who cannot see
 * it, and say where the data came from. A draft may be anything; saving never blocks on this, and the preview lists what is missing.
 */
const holdToPublish: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  if (data._status !== 'published') return data
  const merged = { ...(originalDoc ?? {}), ...data } as Loose
  const problems: string[] = []
  if (!String(merged.altText ?? '').trim()) problems.push('Describe what it shows for people who cannot see it (the accessible description).')
  // Read as the public would: a figure is publishable only if it would draw for a reader, which needs a published version of its data. (No `req`, so
  // the reads are not made as the signed-in editor, who could also see staged versions.)
  const { spec, ctx, dataset, reason } = await readContext({ payload: req.payload, mode: { kind: 'public' } }, merged)
  if (!spec) problems.push('Choose what kind of visualization this is.')
  else {
    if (reason) problems.push(reason)
    else {
      const hosts = await approvedEmbedHosts(req)
      problems.push(...validateSpec(spec, ctx, hosts))
      const source = (merged.source ?? {}) as Loose
      const fromDataset = ((dataset?.source ?? {}) as Loose).name
      if (spec.kind !== 'embed' && !String(source.name ?? '').trim() && !String(fromDataset ?? '').trim()) problems.push('Say where the data comes from: fill in the source on the dataset, or here.')
      if (spec.kind === 'embed' && !String(source.name ?? '').trim()) problems.push('Say who made it (the source).')
    }
  }
  if (problems.length > 0) throw new APIError(`This cannot be published yet:\n• ${problems.join('\n• ')}`, 400, undefined, true)
  return data
}

async function approvedEmbedHosts(req: { payload: { findGlobal: (a: { slug: 'site-settings'; depth: number }) => Promise<{ embedHosts?: { host: string }[] | null }> } }): Promise<string[]> {
  try {
    const s = await req.payload.findGlobal({ slug: 'site-settings', depth: 0 })
    return (s.embedHosts ?? []).map((h) => h.host)
  } catch {
    return []
  }
}

const refresh: CollectionAfterChangeHook = ({ doc, req }) => {
  if (!req.context?.disableRevalidate) revalidateTag(`viz:${doc.id}`)
  return doc
}
const refreshOnDelete: CollectionAfterDeleteHook = ({ doc, req }) => {
  if (!req.context?.disableRevalidate) revalidateTag(`viz:${doc.id}`)
  return doc
}

export const Visualizations: CollectionConfig<'visualizations'> = {
  slug: 'visualizations',
  labels: { singular: 'Visualization', plural: 'Visualizations' },
  access: {
    create: requirePermission('content.write'),
    delete: requirePermission('content.publish'),
    read: publishedOrContentStaff,
    update: requirePermission('content.write'),
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'kind', 'dataset', 'dataMode', '_status', 'updatedAt'],
    listSearchableFields: ['title', 'caption'],
    description: 'A chart, map or table made from a dataset, kept once and put into any number of stories and pages. Change it here and every place that shows it changes.',
    preview: (data, { req }) => generateDataPreviewPath({ data, req }),
    livePreview: { url: ({ data, req }) => generateDataPreviewPath({ data, req }) },
  },
  fields: [
    { name: 'title', type: 'text', required: true, index: true, admin: { description: 'The figure\'s headline, shown above it: say what it shows. "Cases rose in all three counties".' } },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Data and design',
          fields: [
            {
              name: 'kind',
              type: 'select',
              required: true,
              defaultValue: 'chart',
              options: [
                { label: 'Chart', value: 'chart' },
                { label: 'Map', value: 'map' },
                { label: 'Data table', value: 'table' },
                { label: 'Embedded chart or map (Datawrapper, Flourish, ...)', value: 'embed' },
              ],
            },
            {
              name: 'dataset',
              type: 'relationship',
              relationTo: 'datasets',
              admin: {
                allowCreate: true,
                allowEdit: true,
                condition: (d) => d?.kind !== 'embed',
                description: 'The data it draws. Choose one, or press + to add a dataset here: name it and its source, save it, then add a version (upload the file) in its Versions list. The column choices below fill in once it has a file.',
              },
            },
            {
              name: 'dataMode',
              type: 'select',
              defaultValue: 'latest',
              options: [
                { label: 'Follow the latest data: update when a new version is published', value: 'latest' },
                { label: 'Pin to one version: never changes', value: 'pinned' },
              ],
              admin: { condition: (d) => d?.kind !== 'embed', description: 'A pinned figure stays as it was when the story was written, even after the dataset is updated.' },
            },
            {
              name: 'pinnedVersion',
              type: 'relationship',
              relationTo: 'dataset-versions',
              filterOptions: ({ data }) => ({ dataset: { equals: (data as Loose)?.dataset as number } }),
              admin: { condition: (d) => d?.kind !== 'embed' && d?.dataMode === 'pinned', description: 'The version to keep showing.' },
            },
            { name: 'chart', type: 'group', label: 'Chart', admin: { condition: only('chart') }, fields: chartFields },
            { name: 'map', type: 'group', label: 'Map', admin: { condition: only('map') }, fields: mapFields },
            { name: 'table', type: 'group', label: 'Table', admin: { condition: only('table') }, fields: tableFields },
            {
              name: 'embed',
              type: 'group',
              label: 'Embedded chart or map',
              admin: { condition: only('embed') },
              fields: embedFields.map((f) =>
                'name' in f && f.name === 'url'
                  ? ({ ...f, validate: ((v: unknown) => (!v || isHttpsAddress(v) ? true : 'Use the full address, starting with https://')) as TextFieldSingleValidation } as Field)
                  : f,
              ),
            },
          ],
        },
        {
          label: 'Caption and credit',
          fields: [
            { name: 'caption', type: 'text', admin: { description: 'Shown under the figure: what to notice, or the date range. One or two sentences.' } },
            {
              name: 'altText',
              type: 'textarea',
              label: 'Accessible description',
              admin: {
                description:
                  'For people who cannot see the figure: what kind of figure it is, what it compares, and the main finding, in two or three sentences. Not the caption. Required to publish. The data table below the figure carries the exact numbers.',
              },
            },
            {
              name: 'source',
              type: 'group',
              label: 'Source',
              admin: { description: 'Leave blank to credit the source named on the dataset. Fill in to credit someone else (or, for an embed, whoever made it).' },
              fields: [
                { name: 'name', type: 'text' },
                { name: 'url', type: 'text', label: 'Link', validate: ((v: unknown) => (!v || isHttpsAddress(v) ? true : 'Use the full address, starting with https://')) as TextFieldSingleValidation },
              ],
            },
            { name: 'notes', type: 'textarea', label: 'Notes on this figure', admin: { description: 'Anything to add to the dataset\'s methodology for this figure only: how a rate was worked out, what was left out. A blank line starts a new paragraph.' } },
            { name: 'showDownload', type: 'checkbox', label: 'Offer the data for download', defaultValue: true, admin: { description: 'Adds a link to the original file under the figure. Not used for embeds.' } },
          ],
        },
      ],
    },
  ],
  hooks: {
    beforeChange: [enforcePublishPermission, holdToPublish],
    afterChange: [refresh],
    afterDelete: [refreshOnDelete],
  },
  versions: { drafts: { autosave: { interval: 800 } }, maxPerDoc: 30 },
}

