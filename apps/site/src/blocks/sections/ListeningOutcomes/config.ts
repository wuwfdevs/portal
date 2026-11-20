import { defineSection, sectionFields } from '../fields'

/**
 * Outcomes: "You asked. Here's what came of it." (board 5): for each question that has been answered and has an outcome (a story, an episode or a report),
 * the question, who answered, and the outcome as a link to it. The Portal sends only questions with an outcome, and the count of answers appears here and
 * only here (an open question never shows one). Draws nothing when nothing has come of anything yet. Offered only on Listens pages.
 */
export const ListeningOutcomes = defineSection({
  slug: 'sectionListeningOutcomes',
  singular: 'Outcomes',
  plural: 'Outcomes',
  group: 'Collections',
  fields: sectionFields({ own: [] }),
})
