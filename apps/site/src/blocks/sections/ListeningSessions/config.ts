import { defineSection, sectionFields } from '../fields'

/**
 * Coming up: the upcoming listed public sessions, soonest first, each with the question it talks over, a link to its page and its seat form. Every question
 * can be convened around, so a session belongs to a question, never to a campaign. It changes with no one editing the page, and draws nothing when no
 * session is listed. The ways to gather people yourself are on each question's own page. Offered only on Listens pages.
 */
export const ListeningSessions = defineSection({
  slug: 'sectionListeningSessions',
  singular: 'Coming up (sessions)',
  plural: 'Coming up (sessions)',
  group: 'Collections',
  fields: sectionFields({ own: [] }),
})
