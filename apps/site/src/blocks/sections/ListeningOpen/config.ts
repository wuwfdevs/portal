import { defineSection, sectionFields } from '../fields'

export const LISTENING_OPEN_VARIANTS = [
  // The stored values keep their first names (changing one is a data migration for no visible gain): 'campaigns' is the band layout, 'reporters' the cards.
  { label: 'Bands: each question with every way to take part', value: 'campaigns' },
  { label: 'Cards: a card for each question', value: 'reporters' },
] as const

/**
 * Open questions: what the Portal has open for the WUWF Listens hub (board 5). Two layouts over the same read: **bands** (a band for each open question: answer alone, join a session, host a table, ask to host a session)
 * and **cards** (a card for each question). It
 * draws what is open now, so it changes with no one editing the page; its words (the section's heading and intro, and the lines below) are typed here.
 * An open question shows no count. Offered on Listens pages and on the home page, where it is always the restrained form: the questions as at most three
 * cards and a link to the hub, and nothing at all when none is open (the homepage rethink, 2026-11-25; the layout choice is ignored there).
 */
export const ListeningOpen = defineSection({
  slug: 'sectionListeningOpen',
  singular: 'Open questions',
  plural: 'Open questions',
  group: 'Collections',
  fields: sectionFields({
    variants: LISTENING_OPEN_VARIANTS,
    own: [
      {
        name: 'emptyText',
        type: 'textarea',
        admin: { description: 'Bands only. Shown when the whole hub has nothing open, no session, no table and nothing answered: “No reporter has a question open right now. Check back soon.”', condition: (_, s) => s?.variant !== 'reporters' },
      },
      {
        name: 'tableText',
        type: 'textarea',
        admin: { description: 'Bands only. The words in the tile that starts a table: where to gather and what the phone does.', condition: (_, s) => s?.variant !== 'reporters' },
      },
      {
        name: 'voiceOnlyIntro',
        type: 'text',
        admin: { description: 'Cards only. The line under the heading when none of the questions takes a written answer (the intro above says “or in writing”).', condition: (_, s) => s?.variant === 'reporters' },
      },
    ],
  }),
})
