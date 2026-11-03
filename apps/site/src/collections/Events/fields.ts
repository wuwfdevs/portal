import type { Field } from 'payload'

const time = (name: string, label: string, description?: string): Field => ({
  name,
  type: 'text',
  label,
  validate: (v: unknown) => (v == null || v === '' || (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) ? true : 'Use 24-hour HH:MM, for example 19:30.'),
  admin: { description: description ?? '24-hour HH:MM, station time (Central), for example 19:30.', width: '25%' },
})

const date = (name: string, label: string): Field => ({
  name,
  type: 'text',
  label,
  validate: (v: unknown) => (v == null || v === '' || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))) ? true : 'Use YYYY-MM-DD, for example 2026-11-14.'),
  admin: { description: 'YYYY-MM-DD.', width: '25%' },
})

const WEEKDAYS = [
  { label: 'Sunday', value: '0' },
  { label: 'Monday', value: '1' },
  { label: 'Tuesday', value: '2' },
  { label: 'Wednesday', value: '3' },
  { label: 'Thursday', value: '4' },
  { label: 'Friday', value: '5' },
  { label: 'Saturday', value: '6' },
]

/**
 * When an event happens. Mirrors the station's submission form: one time, daily, weekly (every N weeks, on chosen days) or
 * monthly (the nth weekday). `listed` is for a migrated event whose dates could not be read: it keeps Grove's wording and
 * has no dates, and a person fixes it. The typed reader is `lib/events/stored.ts`.
 */
export const scheduleField: Field = {
  name: 'schedule',
  type: 'group',
  label: 'When',
  fields: [
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'once',
      options: [
        { label: 'One time', value: 'once' },
        { label: 'Every day', value: 'daily' },
        { label: 'Every N weeks, on chosen days', value: 'weekly' },
        { label: 'Monthly, on the nth weekday', value: 'monthly' },
        { label: 'Dates not read (migrated)', value: 'listed' },
      ],
    },
    { type: 'row', admin: { condition: (_d, s) => s?.kind === 'once' }, fields: [date('date', 'Date')] },
    {
      type: 'row',
      admin: { condition: (_d, s) => s?.kind === 'daily' || s?.kind === 'weekly' || s?.kind === 'monthly' },
      fields: [date('startDate', 'First date'), date('endDate', 'Last date')],
    },
    {
      type: 'row',
      admin: { condition: (_d, s) => s?.kind === 'once' || s?.kind === 'daily' || s?.kind === 'monthly' },
      fields: [time('start', 'Starts'), time('end', 'Ends', '24-hour HH:MM. Optional for a one-time event.')],
    },
    {
      name: 'everyWeeks',
      type: 'number',
      min: 1,
      max: 52,
      label: 'Every how many weeks',
      admin: { condition: (_d, s) => s?.kind === 'weekly', description: 'Counted from the week of the first date. 1 is every week.' },
    },
    {
      name: 'slots',
      type: 'array',
      label: 'Days',
      maxRows: 7,
      admin: { condition: (_d, s) => s?.kind === 'weekly' },
      fields: [
        { name: 'day', type: 'select', required: true, options: WEEKDAYS },
        { type: 'row', fields: [time('start', 'Starts'), time('end', 'Ends')] },
      ],
    },
    {
      type: 'row',
      admin: { condition: (_d, s) => s?.kind === 'monthly' },
      fields: [
        { name: 'everyMonths', type: 'number', min: 1, max: 12, label: 'Every how many months' },
        {
          name: 'nth',
          type: 'select',
          label: 'Which one',
          options: [
            { label: 'First', value: '1' },
            { label: 'Second', value: '2' },
            { label: 'Third', value: '3' },
            { label: 'Fourth', value: '4' },
            { label: 'Last', value: 'last' },
          ],
        },
        { name: 'weekday', type: 'select', label: 'Day of the week', options: WEEKDAYS },
      ],
    },
    {
      name: 'displayText',
      type: 'text',
      label: 'Wording from Grove',
      admin: { description: 'The date text exactly as Grove showed it. When this is set the event page shows it instead of the sentence made from the fields above.' },
    },
    {
      name: 'startEstimated',
      type: 'checkbox',
      defaultValue: false,
      label: 'First date is an estimate',
      admin: { description: 'Grove did not give a start date for this run; the date it was submitted was used. Check it, then clear this.' },
    },
  ],
}

/** A public submission must name its venue; a migrated event may have none (one in the first ten Grove samples does), and is not given an invented one. */
export const venueField = (required: boolean): Field => ({
  name: 'venue',
  type: 'group',
  label: 'Venue',
  fields: [
    { name: 'name', type: 'text', required },
    { type: 'row', fields: [{ name: 'street', type: 'text' }, { name: 'city', type: 'text' }] },
    { type: 'row', fields: [{ name: 'state', type: 'text', admin: { description: 'Two-letter code, for example FL.', width: '25%' } }, { name: 'zip', type: 'text', admin: { width: '25%' } }] },
    { type: 'row', fields: [{ name: 'email', type: 'email' }, { name: 'phone', type: 'text' }] },
    { name: 'website', type: 'text' },
  ],
})

export const organizationField: Field = {
  name: 'organization',
  type: 'group',
  label: 'Presenting organization',
  fields: [
    { name: 'name', type: 'text' },
    { type: 'row', fields: [{ name: 'email', type: 'email' }, { name: 'phone', type: 'text' }] },
    { name: 'website', type: 'text' },
    {
      name: 'designation',
      type: 'select',
      defaultValue: 'n-a',
      options: [
        { label: 'Not stated', value: 'n-a' },
        { label: 'Not for profit', value: 'not-for-profit' },
        { label: 'For profit', value: 'for-profit' },
      ],
    },
  ],
}

export const artistField: Field = {
  name: 'artist',
  type: 'group',
  label: 'Artist',
  fields: [{ name: 'name', type: 'text' }, { type: 'row', fields: [{ name: 'email', type: 'email' }, { name: 'website', type: 'text' }] }],
}

export const priceFields: Field[] = [
  { type: 'row', fields: [{ name: 'price', type: 'text', label: 'Price or range', admin: { description: 'As written, for example $25-40.' } }, { name: 'free', type: 'checkbox', defaultValue: false, label: 'Free' }] },
  { name: 'priceNotes', type: 'textarea', label: 'Additional pricing information' },
  { name: 'ticketUrl', type: 'text', label: 'Ticket or registration web address' },
]
