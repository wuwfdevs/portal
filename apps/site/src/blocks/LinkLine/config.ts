import type { Block } from 'payload'

import { isLinkLineUrl, LINK_LINE_URL_MESSAGE } from '../../lib/link-line'

type Sibling = { siblingData?: { story?: unknown } }

/**
 * A short label and a link, set apart from the paragraph text: "RELATED  Lawmakers react to the pick", "SUPPORT LOCAL
 * STORIES.  Donate Here". Grove had no such element; editors typed these by hand into a paragraph (81 "RELATED:" lines and 49
 * "Support Local Stories. Donate Here." lines in the census). The converter recognizes exactly those two patterns and builds
 * this block from them, so a migrated story and a new one are made the same way.
 *
 * The link goes to a WUWF story (pick one, and its headline and address follow it) or to any address: a page here, another
 * site, an email. A chosen story wins.
 */
export const LinkLine: Block = {
  slug: 'linkLine',
  interfaceName: 'LinkLineBlock',
  labels: { singular: 'Link line', plural: 'Link lines' },
  fields: [
    {
      name: 'label',
      type: 'text',
      defaultValue: 'Related',
      admin: { description: 'The short words before the link, e.g. "Related", "Related coverage" or "Support Local Stories."' },
    },
    {
      name: 'story',
      type: 'relationship',
      relationTo: 'posts',
      admin: { description: 'Link to a WUWF story. Its headline and address are used, and stay current if the story is renamed.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'linkText',
          type: 'text',
          label: 'Link words',
          admin: {
            width: '50%',
            description: 'Only when no story is picked: the words that are the link.',
            condition: (_data, sibling) => !sibling?.story,
          },
          validate: (value: string | null | undefined, { siblingData }: Sibling) =>
            siblingData?.story || (value && value.trim()) ? true : 'Pick a story, or enter the words to link.',
        },
        {
          name: 'url',
          type: 'text',
          label: 'Link address',
          admin: {
            width: '50%',
            description: 'Only when no story is picked: a page here (/local-news/…), an https:// address, or mailto:.',
            condition: (_data, sibling) => !sibling?.story,
          },
          validate: (value: string | null | undefined, { siblingData }: Sibling) => {
            if (siblingData?.story) return true
            if (!(value ?? '').trim()) return 'Pick a story, or enter the address to link to.'
            return isLinkLineUrl(value) ? true : LINK_LINE_URL_MESSAGE
          },
        },
      ],
    },
    {
      name: 'newTab',
      type: 'checkbox',
      label: 'Open in a new tab',
      admin: { condition: (_data, sibling) => !sibling?.story },
    },
  ],
}
