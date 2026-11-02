import type { Block } from 'payload'

import { fieldRequires } from '../../access/permissions'
import { sanitizeLegacyHtml } from '../../lib/sanitize'

/**
 * HTML from the old site that could not be mapped to a block. Kept so nothing is dropped, never trusted: it is
 * sanitized when saved and again when rendered, and only an administrator can write it. Do not use it for new work.
 */
export const LegacyHtml: Block = {
  slug: 'legacyHtml',
  interfaceName: 'LegacyHtmlBlock',
  labels: { singular: 'Preserved HTML (migrated)', plural: 'Preserved HTML (migrated)' },
  fields: [
    {
      name: 'html',
      type: 'textarea',
      required: true,
      access: { create: fieldRequires('settings.manage'), update: fieldRequires('settings.manage') },
      admin: { description: 'Sanitized on save: scripts, styles, frames, forms, event handlers and non-https links and images are removed.' },
      hooks: { beforeChange: [({ value }) => sanitizeLegacyHtml(value)] },
    },
    { name: 'note', type: 'text', admin: { description: 'Why this was preserved, e.g. "interactive map from 2019".' } },
  ],
}
