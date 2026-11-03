import type { Block } from 'payload'

/**
 * A "Related: <story headline>" line set apart from the paragraph text. Grove had no such element: editors typed a bold
 * "RELATED:" and a link into a paragraph by hand. The converter recognizes exactly that pattern and makes this block
 * (with the link's address and words), so the migrated story and a new one are built the same way.
 *
 * Two ways to fill it in. Pick a story, and the headline and address follow that story (they update if it is renamed).
 * Or, for a migrated line or a link to another site, type the headline and the address. A chosen story wins.
 */
export const RelatedStory: Block = {
  slug: 'relatedStory',
  interfaceName: 'RelatedStoryBlock',
  labels: { singular: 'Related story', plural: 'Related stories' },
  fields: [
    {
      name: 'label',
      type: 'text',
      defaultValue: 'Related',
      admin: { description: 'The word before the headline, e.g. "Related" or "Related coverage".' },
    },
    {
      name: 'story',
      type: 'relationship',
      relationTo: 'posts',
      admin: { description: 'Pick a WUWF story. Its headline and address are used, and stay current if the story is renamed.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'headline',
          type: 'text',
          admin: {
            width: '50%',
            description: 'Only when no story is picked: the words to show.',
            condition: (_data, sibling) => !sibling?.story,
          },
          validate: (value: string | null | undefined, { siblingData }: { siblingData?: { story?: unknown } }) =>
            siblingData?.story || (value && value.trim()) ? true : 'Pick a story, or enter the headline to show.',
        },
        {
          name: 'url',
          type: 'text',
          admin: {
            width: '50%',
            description: 'Only when no story is picked: a path on this site (/local-news/…) or an https address.',
            condition: (_data, sibling) => !sibling?.story,
          },
          validate: (value: string | null | undefined, { siblingData }: { siblingData?: { story?: unknown } }) => {
            if (siblingData?.story) return true
            const v = (value ?? '').trim()
            if (!v) return 'Pick a story, or enter the address to link to.'
            return /^\/(?!\/)/.test(v) || /^https:\/\//i.test(v) ? true : 'Use a path that starts with / or an address that starts with https://.'
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
