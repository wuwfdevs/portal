import type { CollectionBeforeDeleteHook, CollectionConfig, TextFieldSingleValidation } from 'payload'

import { APIError } from 'payload'

import { requirePermission } from '../../access/permissions'
import { isHttpsAddress } from '../../lib/network/original'

/**
 * A dataset: the identity of some data and what a reader is owed about it (who made it, how). The rows live in its versions
 * (`dataset-versions`), each an immutable upload, so a dataset can be updated without losing what it said last month and a visualization can
 * stay on a version it was written around. A dataset knows nothing about charts: visualizations point at it.
 *
 * Staff only. A reader never reads this record: the few fields a figure prints are read by code that has first shown there is a published
 * version to draw (`lib/dataviz/read.ts`), so a dataset's title cannot leak before its data is public.
 */
const refuseDeleteWhenUsed: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const used = await req.payload.find({ collection: 'visualizations', where: { or: [{ dataset: { equals: id } }, { 'map.boundaryDataset': { equals: id } }] }, limit: 5, depth: 0, overrideAccess: true, req })
  if (used.totalDocs > 0) {
    const names = used.docs.map((d) => `"${(d as { title?: string }).title ?? d.id}"`).join(', ')
    throw new APIError(`This dataset is used by ${used.totalDocs} visualization${used.totalDocs === 1 ? '' : 's'} (${names}${used.totalDocs > 5 ? ', …' : ''}). Delete or change those first.`, 409, undefined, true)
  }
}

export const Datasets: CollectionConfig = {
  slug: 'datasets',
  labels: { singular: 'Dataset', plural: 'Datasets' },
  access: {
    create: requirePermission('content.write'),
    read: requirePermission('content.write'),
    update: requirePermission('content.write'),
    delete: requirePermission('content.publish'),
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'source.name', 'updatedAt'],
    listSearchableFields: ['title', 'description', 'source.name'],
    description: 'Data that charts, maps and tables draw from. Add a dataset once, then upload a new version whenever the numbers change.',
  },
  fields: [
    { name: 'title', type: 'text', required: true, index: true, admin: { description: 'What the data is, e.g. "Escambia County school grades, 2015 to 2025".' } },
    { name: 'description', type: 'textarea', admin: { description: 'For staff: what is in it and anything to know before using it. Not shown to readers.' } },
    {
      name: 'source',
      type: 'group',
      label: 'Source',
      admin: { description: 'Who made the data. Every chart and map made from it credits this, unless the visualization names its own.' },
      fields: [
        { name: 'name', type: 'text', admin: { description: 'e.g. "Florida Department of Education". Required to publish a visualization that uses the dataset.' } },
        {
          name: 'url',
          type: 'text',
          label: 'Link to the source',
          validate: ((value: unknown) => (value === undefined || value === null || value === '' || isHttpsAddress(value) ? true : 'Use the full address, starting with https://')) as TextFieldSingleValidation,
        },
      ],
    },
    { name: 'methodology', type: 'textarea', admin: { description: 'How the numbers were collected or calculated, and their limits. Shown under every figure made from this dataset. A blank line starts a new paragraph.' } },
    {
      name: 'versions',
      type: 'join',
      collection: 'dataset-versions',
      on: 'dataset',
      defaultSort: '-version',
      admin: { allowCreate: true, description: 'Each upload is a version and is never changed. A visualization follows the newest published version, or stays on one you pin.', defaultColumns: ['version', 'label', 'format', 'rowCount', 'published'] },
    },
    {
      name: 'visualizations',
      type: 'join',
      collection: 'visualizations',
      on: 'dataset',
      admin: { allowCreate: false, description: 'The charts, maps and tables that draw from this dataset.', defaultColumns: ['title', 'kind', '_status'] },
    },
  ],
  hooks: { beforeDelete: [refuseDeleteWhenUsed] },
}
