import type { Block } from 'payload'

/** A pulled quotation set apart from the text: the quote, who said it, and optionally a picture. */
export const PullQuote: Block = {
  slug: 'pullQuote',
  interfaceName: 'PullQuoteBlock',
  labels: { singular: 'Pull quote', plural: 'Pull quotes' },
  fields: [
    { name: 'text', type: 'textarea', required: true },
    { name: 'attribution', type: 'text', admin: { description: 'Who said it, e.g. "Dana Whitlock, Warrington".' } },
    { name: 'image', type: 'upload', relationTo: 'media' },
  ],
}
