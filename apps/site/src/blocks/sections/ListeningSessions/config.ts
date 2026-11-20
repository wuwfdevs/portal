import { defineSection, sectionFields } from '../fields'

export const LISTENING_SESSIONS_VARIANTS = [
  { label: 'Sessions: upcoming public sessions to join', value: 'sessions' },
  { label: 'Tables: start a private table of your own', value: 'tables' },
] as const

/**
 * Sessions and tables: what the Portal offers for taking part with other people, for the WUWF Listens hub (board 5). **Sessions** are the upcoming listed public
 * sessions that belong to no campaign (a campaign's own sessions are in its band, in Open questions), each with a link to its page and a seat form.
 * **Tables** are the campaigns anyone may start a private one-table session for, with the form to start one. Both change with no one editing the page, and
 * both draw nothing when there is nothing to offer. Offered only on Listens pages.
 */
export const ListeningSessions = defineSection({
  slug: 'sectionListeningSessions',
  singular: 'Sessions and tables',
  plural: 'Sessions and tables',
  group: 'Collections',
  fields: sectionFields({ variants: LISTENING_SESSIONS_VARIANTS, own: [] }),
})
