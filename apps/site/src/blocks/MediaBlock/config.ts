import type { Block } from 'payload'

/**
 * A picture (or video file) from the media library, placed in a story or page. What belongs to the file itself
 * (alt text, credit, source) lives on the library record and is the default; the fields here are for this one use
 * and override the library when filled in.
 */
export const MediaBlock: Block = {
  slug: 'mediaBlock',
  interfaceName: 'MediaBlock',
  fields: [
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    {
      name: 'caption',
      type: 'text',
      admin: { description: 'Shown under the picture. Leave empty to use the library caption, if it has one.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'credit',
          type: 'text',
          admin: { width: '50%', description: 'Leave empty to use the library credit.' },
        },
        {
          name: 'source',
          type: 'text',
          admin: { width: '50%', description: 'Leave empty to use the library source.' },
        },
      ],
    },
    {
      name: 'altText',
      type: 'text',
      admin: { description: 'Replaces the library alt text for this use only. Leave empty to use the library alt text.' },
    },
    {
      name: 'alignment',
      type: 'select',
      defaultValue: 'full',
      options: [
        { label: 'Full width of the text', value: 'full' },
        { label: 'Centered, smaller', value: 'center' },
        { label: 'Left, text wraps', value: 'left' },
        { label: 'Right, text wraps', value: 'right' },
      ],
    },
  ],
}
