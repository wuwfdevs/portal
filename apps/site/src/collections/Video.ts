import type { CollectionConfig } from 'payload'

import path from 'path'
import { fileURLToPath } from 'url'

import { anyone } from '../access/anyone'
import { requirePermission } from '../access/permissions'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * The video library: video files that stories and shows reuse. Kept apart from `media` and `audio` for the same
 * reasons audio is: it takes video files only, generates no image sizes, and can have its own limits and storage.
 * Public, like the others. Video hosted by YouTube or Vimeo is not stored here; it is an Embed.
 */
export const Video: CollectionConfig = {
  slug: 'video',
  labels: { singular: 'Video file', plural: 'Video files' },
  access: {
    create: requirePermission('content.write'),
    delete: requirePermission('content.write'),
    read: anyone,
    update: requirePermission('content.write'),
  },
  admin: {
    group: 'Media library',
    useAsTitle: 'title',
    defaultColumns: ['title', 'credit', 'durationSeconds', 'updatedAt'],
    listSearchableFields: ['title', 'filename', 'credit'],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'What the video is. Read aloud by a screen reader as its label.' },
    },
    { name: 'description', type: 'textarea' },
    {
      name: 'credit',
      type: 'text',
      index: true,
      admin: { description: 'Who made it, e.g. "WUWF News".' },
    },
    {
      name: 'durationSeconds',
      type: 'number',
      min: 0,
      admin: { description: 'Length in seconds. Optional; shown next to the player when set.' },
    },
    {
      name: 'poster',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'The picture shown before the video plays. Optional; a story can choose a different one.' },
    },
    {
      name: 'legacy',
      type: 'group',
      label: 'From Grove',
      admin: { position: 'sidebar', description: 'Set by the migration. Leave empty for new work.' },
      fields: [
        {
          name: 'sourceUrl',
          type: 'text',
          unique: true,
          index: true,
          access: { update: () => false },
          admin: {
            description:
              'The address this file was copied from. The import matches on it, so a file used in many stories is stored once. Cannot be changed once set.',
          },
        },
      ],
    },
  ],
  upload: {
    staticDir: path.resolve(dirname, '../../public/video'),
    mimeTypes: ['video/*'],
  },
}
