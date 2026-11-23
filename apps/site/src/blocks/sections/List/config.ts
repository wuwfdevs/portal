import { validateHref } from '@/lib/section-links'

import { defineSection, sectionFields } from '../fields'

export const LIST_VARIANTS = [
  { label: 'Grid: cards in rows', value: 'grid' },
  { label: 'Rail: one row that scrolls sideways', value: 'rail' },
  { label: 'Numbered: a ranked list', value: 'numbered' },
  { label: 'Lead and list: one large, the rest beside it', value: 'lead' },
  { label: 'Tiles: square pictures with a line or two of words', value: 'tiles' },
  { label: 'Rows: a line of details, then the title, no pictures', value: 'rows' },
] as const

/**
 * List: stories, episodes, video stories, artists or past RadioLive shows, read from the site (PAGE-BLOCKS.md → Block catalogue). Its source is a query, so it
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
          { label: 'Every listed show (the podcast directory)', value: 'shows' },
          { label: 'Video stories', value: 'videos' },
          { label: 'Short videos (the clips)', value: 'clips' },
          { label: 'RadioLive artists', value: 'artists' },
          { label: 'RadioLive shows to watch (past shows with a recording, newest first)', value: 'performances' },
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
        admin: { description: 'Stories, and short videos (by their story\'s section). A topic is for stories only.', condition: (_, s) => s?.source === 'stories' || s?.source === 'clips' },
      },
      { name: 'section', type: 'relationship', relationTo: 'sections', admin: { condition: (_, s) => (s?.source === 'stories' || s?.source === 'clips') && s?.scope === 'section' } },
      {
        name: 'series',
        type: 'relationship',
        relationTo: 'series',
        label: 'Series first',
        admin: { description: "Optional. Put this series' short videos first, e.g. during a big story. Leave empty for the newest from every series.", condition: (_, s) => s?.source === 'clips' && s?.scope !== 'section' },
      },
      { name: 'topic', type: 'relationship', relationTo: 'categories', admin: { condition: (_, s) => s?.source === 'stories' && s?.scope === 'topic' } },
      {
        name: 'allShows',
        type: 'checkbox',
        label: 'Episodes from every listed show',
        defaultValue: false,
        admin: { description: 'The newest episodes across all the podcasts, each with its show’s name, instead of one show’s.', condition: (_, s) => s?.source === 'episodes' },
      },
      { name: 'show', type: 'relationship', relationTo: 'productions', admin: { condition: (_, s) => s?.source === 'episodes' && s?.allShows !== true } },
      { name: 'count', type: 'number', min: 1, max: 12, defaultValue: 6, admin: { description: 'How many to show, 1 to 12. A list of shows has every listed show.', condition: (_, s) => s?.source !== 'shows' } },
      { name: 'moreLabel', type: 'text', admin: { description: 'Optional link at the top right of the list: "All stories".' } },
      { name: 'moreHref', type: 'text', label: 'More link', validate: validateHref },
    ],
  }),
})
