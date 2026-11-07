import type { CollectionConfig } from 'payload'

import path from 'path'
import { fileURLToPath } from 'url'

import { requirePermission } from '../access/permissions'
import { membersOnlyField, privateFileHeaders, publicUnlessMembersOnly } from '../lib/members/access'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * The audio library: station audio that stories, shows and the player reuse. Kept apart from `media` so it takes
 * audio files only, has no image sizes to generate, and can have its own upload limits and storage settings.
 * Public, except a file marked members-only (a members' episode): the public cannot read its record or fetch the file
 * from its address (the file route applies the same read access).
 */
export const Audio: CollectionConfig = {
  slug: 'audio',
  labels: { singular: 'Audio file', plural: 'Audio files' },
  access: {
    create: requirePermission('content.write'),
    delete: requirePermission('content.write'),
    read: publicUnlessMembersOnly,
    update: requirePermission('content.write'),
  },
  admin: {
    group: 'Media library',
    useAsTitle: 'title',
    defaultColumns: ['title', 'credit', 'durationSeconds', 'updatedAt'],
    listSearchableFields: ['title', 'filename', 'credit'],
  },
  // The members-only flag is always read, so the access rules never see a file without it.
  forceSelect: { membersOnly: true },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'What a listener sees on the player, e.g. "Listen to this story".' },
    },
    { name: 'description', type: 'textarea' },
    membersOnlyField('Only WUWF members may hear it (a members\' episode). The public cannot play or download it from its address.'),
    {
      name: 'credit',
      type: 'text',
      index: true,
      admin: { description: 'Who produced it, e.g. "WUWF News".' },
    },
    {
      name: 'durationSeconds',
      type: 'number',
      min: 0,
      admin: { description: 'Length in seconds. Optional; shown next to the player when set.' },
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
    staticDir: path.resolve(dirname, '../../public/audio'),
    // Audio only. Naming the types also skips Payload's blocked-file-type list, which would otherwise be irrelevant here.
    mimeTypes: ['audio/*'],
    modifyResponseHeaders: privateFileHeaders,
  },
}
