import type { Block } from 'payload'

/**
 * A set of images with captions and credits, laid out as a grid or a list (the two layouts Brightspot's gallery
 * offers). Dynamic galleries (filled by tag or date) are not built yet.
 */
export const Gallery: Block = {
  slug: 'gallery',
  interfaceName: 'GalleryBlock',
  labels: { singular: 'Gallery', plural: 'Galleries' },
  fields: [
    { name: 'title', type: 'text', admin: { description: 'Optional heading above the gallery.' } },
    {
      name: 'layout',
      type: 'select',
      required: true,
      defaultValue: 'grid',
      options: [
        { label: 'Grid', value: 'grid' },
        { label: 'List (one per row)', value: 'list' },
      ],
    },
    {
      name: 'images',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        { name: 'image', type: 'upload', relationTo: 'media', required: true },
        { name: 'caption', type: 'text' },
        { name: 'credit', type: 'text' },
      ],
    },
  ],
}
