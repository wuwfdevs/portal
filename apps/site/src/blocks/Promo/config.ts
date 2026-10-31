import type { Block } from 'payload'

/** A card pointing at another story, page or fellowship. It shows that item's current headline unless overridden. */
export const Promo: Block = {
  slug: 'promo',
  interfaceName: 'PromoBlock',
  labels: { singular: 'Promo card', plural: 'Promo cards' },
  fields: [
    { name: 'target', type: 'relationship', relationTo: ['posts', 'pages', 'fellowships'], required: true },
    { name: 'headline', type: 'text', admin: { description: 'Leave empty to use the item\'s own title.' } },
    { name: 'description', type: 'textarea', admin: { description: 'Leave empty to use the item\'s summary.' } },
    { name: 'image', type: 'upload', relationTo: 'media' },
  ],
}
