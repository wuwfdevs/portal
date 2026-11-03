import type { CollectionConfig } from 'payload'
import { slugField } from 'payload'

import { anyone } from '../access/anyone'
import { requirePermission } from '../access/permissions'
import { ensureSlug } from '../hooks/ensureSlug'
import { ERA_OPTIONS } from '../lib/unearthing/periods'
import { revalidatePath } from '../lib/revalidate'

const percent = (label: string) => (v: number | null | undefined) => (v === undefined || v === null || (v >= 0 && v <= 100) ? true : `${label} must be between 0 and 100.`)

/**
 * A place Unearthing Florida's episodes are about: a mission, a fort, a shell midden. Episodes point at one; the hub's map shows
 * each as a pin. The map is schematic (a drawing of the state, not a survey), so a pin's position is two percentages that an
 * editor can nudge, not a latitude and longitude.
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
  admin: { group: 'Editorial', useAsTitle: 'name', defaultColumns: ['name', 'place', 'era', 'updatedAt'], description: 'Places Unearthing Florida episodes are about. Each appears as a pin on the hub\'s map.' },
  hooks: {
    beforeValidate: [ensureSlug('name')],
    afterChange: [({ doc, req: { context } }) => {
      if (!context.disableRevalidate) revalidatePath('/unearthing-florida')
      return doc
    }],
    afterDelete: [({ doc, req: { context } }) => {
      if (!context.disableRevalidate) revalidatePath('/unearthing-florida')
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
        { name: 'mapX', type: 'number', label: 'Map: across', defaultValue: 50, min: 0, max: 100, validate: percent('Across'), admin: { description: '0 is the west edge, 100 the east.', width: '50%' } },
        { name: 'mapY', type: 'number', label: 'Map: down', defaultValue: 50, min: 0, max: 100, validate: percent('Down'), admin: { description: '0 is the north edge, 100 the south.', width: '50%' } },
      ],
    },
  ],
}
