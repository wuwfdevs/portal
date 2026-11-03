import type { CollectionConfig } from 'payload'

import path from 'path'
import { fileURLToPath } from 'url'

import { requirePermission } from '../../access/permissions'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Pictures that came with a public submission. PRIVATE: staff only, and nothing here is ever linked from a public page. A
 * picture becomes public only when staff put it in the media library (with its alt text and credit) and attach it to the event.
 * Written only by the submission handler (Local API); the public has no access to this collection.
 */
export const EventSubmissionImages: CollectionConfig = {
  slug: 'event-submission-images',
  labels: { singular: 'Submitted picture', plural: 'Submitted pictures' },
  access: { read: requirePermission('content.write'), create: requirePermission('content.write'), update: requirePermission('content.write'), delete: requirePermission('content.write') },
  admin: { group: 'Community calendar', hidden: true },
  upload: {
    staticDir: path.resolve(dirname, '../../../public/event-submission-images'),
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    imageSizes: [],
    adminThumbnail: undefined,
    disableLocalStorage: false,
  },
  fields: [],
}
