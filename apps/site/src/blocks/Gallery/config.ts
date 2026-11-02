import type { Block } from 'payload'

/**
 * A set of pictures with titles, captions and credits, shown as a carousel, a grid or a list (the layouts Grove's
 * galleries use). Dynamic galleries (filled by tag or date) are not built.
 */
export const Gallery: Block = {
  slug: 'gallery',
  interfaceName: 'GalleryBlock',
  labels: { singular: 'Gallery', plural: 'Galleries' },
  fields: [
    { name: 'title', type: 'text', admin: { description: 'Optional heading above the gallery.' } },
    { name: 'description', type: 'textarea', admin: { description: 'Optional text under the heading.' } },
    {
      name: 'layout',
      type: 'select',
      required: true,
      defaultValue: 'carousel',
      options: [
        { label: 'Carousel (swipe or scroll sideways)', value: 'carousel' },
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
        { name: 'title', type: 'text' },
        { name: 'caption', type: 'text' },
        { name: 'credit', type: 'text', admin: { description: 'Leave empty to use the library credit.' } },
      ],
    },
  ],
}
