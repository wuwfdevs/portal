import { defineSection, sectionFields } from '../fields'

/**
 * Broadcast schedule: the week's programs for each of the station's streams (PAGE-BLOCKS.md phase 5). Its words are only its heading; the streams are the
 * Listen live settings and the programs come from NPR Cadence, so nobody types a program here. A visitor picks a stream and a day; "On now" marks the
 * program on the air. With no stream set up it draws nothing.
 */
export const BroadcastSchedule = defineSection({
  slug: 'sectionBroadcastSchedule',
  singular: 'Broadcast schedule',
  plural: 'Broadcast schedules',
  group: 'Collections',
  fields: sectionFields({ own: [] }),
})
