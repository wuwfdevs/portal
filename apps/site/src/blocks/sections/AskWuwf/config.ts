import { defineSection, sectionFields } from '../fields'

/**
 * Ask WUWF: the opening of the WUWF Listens hub (board 5): a label, the headline, a line, the links down the page, and the Ask WUWF form beside them. Its
 * words are typed here; whether a link to "what came of it" or a table is shown depends on what the Portal has, so those links are drawn only when
 * there is something to go to. The form sends to the Portal (a person at WUWF reads every message); this site stores nothing. Offered only on Listens pages.
 */
export const AskWuwf = defineSection({
  slug: 'sectionAskWuwf',
  singular: 'Ask WUWF',
  plural: 'Ask WUWF',
  group: 'Lead',
  fields: sectionFields({
    heading: false,
    own: [
      { name: 'label', type: 'text', admin: { description: 'A short line above the headline.' } },
      { name: 'headline', type: 'text', required: true },
      { name: 'line', type: 'textarea', admin: { description: 'A blank line starts a new paragraph.' } },
      {
        name: 'jumpLinks',
        type: 'checkbox',
        label: 'Links down the page',
        defaultValue: true,
        admin: {
          description:
            'Under the line: Answer a question, See what came of other people’s answers, Ask WUWF something, Host a table of your own and Host a listening session. Each is shown only when there is something to go to. They point at sections with the anchors now, help-us-report, came-of-it, kitchen-table and the Ask form.',
        },
      },
    ],
  }),
})
