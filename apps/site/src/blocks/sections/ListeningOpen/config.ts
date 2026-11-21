import { defineSection, sectionFields } from '../fields'

export const LISTENING_OPEN_VARIANTS = [
  { label: 'Campaigns: each question with every way to take part', value: 'campaigns' },
  { label: 'Reporters’ questions: a card for each', value: 'reporters' },
] as const

/**
 * Open questions: what the Portal has open for the WUWF Listens hub (board 5). Two layouts over the same read: the **campaigns** (a band for each: its
 * question, then answer alone, join a session, host a table) and the **reporters' questions** that belong to no campaign (a card for each). It
 * draws what is open now, so it changes with no one editing the page; its words (the section's heading and intro, and the lines below) are typed here.
 * An open question shows no count. Offered only on Listens pages.
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
        admin: { description: 'Campaigns only. Shown when the whole hub has nothing open, no session, no table and nothing answered: “No reporter has a question open right now. Check back soon.”', condition: (_, s) => s?.variant !== 'reporters' },
      },
      {
        name: 'tableText',
        type: 'textarea',
        admin: { description: 'Campaigns only. The words in the tile that starts a table: where to gather and what the phone does.', condition: (_, s) => s?.variant !== 'reporters' },
      },
      {
        name: 'voiceOnlyIntro',
        type: 'text',
        admin: { description: 'Reporters’ questions only. The line under the heading when none of the questions takes a written answer (the intro above says “or in writing”).', condition: (_, s) => s?.variant === 'reporters' },
      },
    ],
  }),
})
