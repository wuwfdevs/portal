import { validateHref } from '@/lib/section-links'

import { defineSection, sectionFields } from '../fields'

export const DATES_VARIANTS = [
  { label: 'Rows: one line each', value: 'rows' },
  { label: 'Cards: a card each', value: 'cards' },
] as const

/**
 * Dates: dated things with a time, a place and a link, that drop off by themselves once they have passed (PAGE-BLOCKS.md → Block
 * catalogue). Not "Schedule": `/schedule` is the broadcast schedule. Three sources: dates typed here, RadioLive shows, or the community
 * calendar. A typed or read date is "on" until its end, or three hours after its start when it has no end. Times are the station's
 * (Central). The page holding this block is cached for at most five minutes, so a passed date is gone on the next regeneration.
 */
export const Dates = defineSection({
  slug: 'sectionDates',
  singular: 'Dates',
  plural: 'Dates',
  group: 'Collections',
  fields: sectionFields({
    variants: DATES_VARIANTS,
    own: [
      {
        name: 'source',
        type: 'select',
        required: true,
        defaultValue: 'typed',
        options: [
          { label: 'Dates I type here', value: 'typed' },
          { label: 'RadioLive shows', value: 'radiolive' },
          { label: 'The community calendar', value: 'events' },
        ],
      },
      { name: 'count', type: 'number', min: 1, max: 12, defaultValue: 6, admin: { description: 'The most dates to show, 1 to 12. The soonest come first.' } },
      { name: 'actionLabel', type: 'text', admin: { description: 'The words on each date\'s link. Empty: "Details".' } },
      {
        name: 'items',
        type: 'array',
        maxRows: 24,
        admin: { description: 'Dates I type here only.', condition: (_, s) => s?.source === 'typed' },
        fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'startsAt', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayAndTime' }, description: 'In Central time. A date with no time: choose 12:00 a.m.' } },
          { name: 'endsAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' }, description: 'Optional. After it passes the date drops off.' } },
          { name: 'place', type: 'text' },
          { name: 'href', type: 'text', label: 'Link', validate: validateHref },
        ],
      },
    ],
  }),
})
