import type { CollectionConfig } from 'payload'
import { slugField } from 'payload'

import { anyone } from '../access/anyone'
import { requirePermission } from '../access/permissions'
import { ensureSlug } from '../hooks/ensureSlug'
import { ERA_OPTIONS } from '../lib/unearthing/periods'
import { revalidateTag } from '../lib/revalidate'


/**
 * A place Unearthing Florida's episodes are about: a mission, a fort, a shell midden. Episodes point at one; the Explore block's map shows each as a pin at its latitude and longitude
 * (hubs redesign, 2026-11-23). A site with no coordinates is listed but not mapped. The old schematic position (two percentages on a drawing of the state) is gone: a drawing's percentages
 * cannot be turned into a place, so the columns were dropped (`20261123_040000_drop_site_map_xy`) and nothing was guessed.
 */
export const Sites: CollectionConfig = {
  slug: 'sites',
  labels: { singular: 'Archaeological site', plural: 'Archaeological sites' },
  access: {
    read: anyone,
    create: requirePermission('content.write'),
    update: requirePermission('content.write'),
    delete: requirePermission('content.publish'),
  },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'place', 'era', 'updatedAt'], description: 'Places Unearthing Florida episodes are about. Each with a latitude and longitude appears on the Explore map.' },
  hooks: {
    beforeValidate: [ensureSlug('name')],
    afterChange: [({ doc, req: { context } }) => {
      if (!context.disableRevalidate) revalidateTag('explore', 'max')
      return doc
    }],
    afterDelete: [({ doc, req: { context } }) => {
      if (!context.disableRevalidate) revalidateTag('explore', 'max')
      return doc
    }],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    slugField({ useAsSlug: 'name' }),
    { name: 'short', type: 'text', maxLength: 24, admin: { description: 'The label beside the pin. Defaults to the name.' } },
    { name: 'place', type: 'text', required: true, admin: { description: 'Town or area, e.g. "Tallahassee".' } },
    { name: 'era', type: 'select', required: true, options: ERA_OPTIONS, admin: { description: 'Used by the hub\'s era filter.' } },
    { name: 'description', type: 'textarea', admin: { description: 'One or two sentences, shown when the pin is chosen.' } },
    {
      type: 'row',
      fields: [
        {
          name: 'latitude',
          type: 'number',
          min: -90,
          max: 90,
          admin: { width: '50%', step: 0.000001, description: 'Degrees north, e.g. 30.4213 for Pensacola. Decimal, with a minus sign south of the equator. With the longitude, puts the site on the Explore map; without both it is listed but not mapped.' },
        },
        {
          name: 'longitude',
          type: 'number',
          min: -180,
          max: 180,
          admin: { width: '50%', step: 0.000001, description: 'Degrees east: negative in Florida, e.g. -87.2169 for Pensacola.' },
        },
      ],
    },
  ],
}
