import { defineSection, sectionFields } from '../fields'

/**
 * Host form: "bring a listening session to your table" (board 5c). The request form for WUWF Listens: a name, an email, what kind of session, how many
 * seats and a note. It is a request, not a booking: someone at WUWF reads it and writes back, and the site stores nothing (the Portal keeps the request).
 * Nothing here collects payment details. Offered only on Listens pages.
 */
export const HostForm = defineSection({
  slug: 'sectionHostForm',
  singular: 'Host form',
  plural: 'Host forms',
  group: 'Action',
  fields: sectionFields({ own: [] }),
})
