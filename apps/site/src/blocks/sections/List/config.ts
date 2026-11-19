import { validateHref } from '@/lib/section-links'

import { defineSection, sectionFields } from '../fields'

export const LIST_VARIANTS = [
  { label: 'Grid: cards in rows', value: 'grid' },
  { label: 'Rail: one row that scrolls sideways', value: 'rail' },
  { label: 'Numbered: a ranked list', value: 'numbered' },
  { label: 'Lead and list: one large, the rest beside it', value: 'lead' },
] as const

/**
 * List: stories, episodes, video stories or artists, read from the site (PAGE-BLOCKS.md → Block catalogue). Its source is a query, so it
 * is not Cards. Four layouts over the same entries. It reads published records only, at draw time, cached for five minutes; the page
 * holding it is cached for no longer. A source's own choice (the section, topic or show) is read only when that source is picked.
 */
export const List = defineSection({
  slug: 'sectionList',
  singular: 'List',
  plural: 'Lists',
  group: 'Collections',
  fields: sectionFields({
    variants: LIST_VARIANTS,
    own: [
      {
        name: 'source',
        type: 'select',
        required: true,
        defaultValue: 'stories',
        options: [
          { label: 'Stories', value: 'stories' },
          { label: 'Episodes of a show', value: 'episodes' },
          { label: 'Video stories', value: 'videos' },
          { label: 'RadioLive artists', value: 'artists' },
        ],
      },
      {
        name: 'scope',
        type: 'select',
        defaultValue: 'latest',
        options: [
          { label: 'The newest of everything', value: 'latest' },
          { label: 'A section', value: 'section' },
          { label: 'A topic', value: 'topic' },
        ],
        admin: { description: 'Stories only.', condition: (_, s) => s?.source === 'stories' },
      },
      { name: 'section', type: 'relationship', relationTo: 'sections', admin: { condition: (_, s) => s?.source === 'stories' && s?.scope === 'section' } },
      { name: 'topic', type: 'relationship', relationTo: 'categories', admin: { condition: (_, s) => s?.source === 'stories' && s?.scope === 'topic' } },
      { name: 'show', type: 'relationship', relationTo: 'productions', admin: { condition: (_, s) => s?.source === 'episodes' } },
      { name: 'count', type: 'number', min: 1, max: 12, defaultValue: 6, admin: { description: 'How many to show, 1 to 12.' } },
      { name: 'moreLabel', type: 'text', admin: { description: 'Optional link under the list: "All stories".' } },
      { name: 'moreHref', type: 'text', label: 'More link', validate: validateHref },
    ],
  }),
})
