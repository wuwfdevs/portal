import type { Block } from 'payload'

import { PUBLIC_ID_MESSAGE, publicIdFromInput } from '../../lib/listening/placement'

/**
 * A WUWF Listens query inside a story, or at the end of an episode or video (leading with recording): either way all of the query's
 * questions, the same screens as its own page. The query itself lives in the Portal; this block only says which one to show, so nothing
 * about a submission, a consent or an answer is stored here. It shows nothing at all once the query closes.
 *
 * Staff-facing words: a **query** is what is written, opened and closed (the Portal's own word); it holds one or more **questions**.
 * One listening component to a page: put at most one of these in a story.
 */
export const ListeningAsk: Block = {
  slug: 'listeningAsk',
  interfaceName: 'ListeningAskBlock',
  labels: { singular: 'Listening query', plural: 'Listening queries' },
  fields: [
    {
      name: 'question',
      type: 'text',
      required: true,
      label: 'Query code or address',
      admin: {
        components: { Field: '@/components/admin/ListeningQuestion#ListeningQuestion' },
        description: 'Choose a query from the Portal, or press New query to write one here (it starts as a draft; open it when it is ready). The story holds only its 16-character code.',
      },
      validate: (value: string | null | undefined) => (publicIdFromInput(value) ? true : PUBLIC_ID_MESSAGE),
    },
    {
      name: 'variant',
      type: 'radio',
      required: true,
      defaultValue: 'story',
      options: [
        { label: 'In the story: all of the query’s questions, the same as the query’s own page', value: 'story' },
        { label: 'After an episode or video: all of the query’s questions, leading with recording', value: 'voice' },
      ],
      admin: { layout: 'vertical' },
    },
    {
      name: 'recipient',
      type: 'text',
      maxLength: 60,
      admin: {
        condition: (_data, sibling) => sibling?.variant === 'voice',
        description: 'Who receives the message, e.g. "Mary" or "the Unearthing Florida team". Empty uses the person who asked the query, or WUWF.',
      },
    },
    {
      name: 'description',
      type: 'text',
      maxLength: 200,
      admin: {
        condition: (_data, sibling) => sibling?.variant === 'voice',
        description: 'One line about what happens to it. Do not promise a reply or a date.',
      },
    },
  ],
}
