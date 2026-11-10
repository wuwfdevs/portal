import type { Block } from 'payload'

import { PUBLIC_ID_MESSAGE, publicIdFromInput } from '../../lib/listening/placement'

/**
 * A WUWF Listens question inside a story (component B) or at the end of an episode or video (component D, voice first). The
 * question itself lives in the Portal; this block only says which one to show, so nothing about a submission, a consent or an
 * answer is stored here. It shows nothing at all once the question closes.
 *
 * One listening component to a page: put at most one of these in a story.
 */
export const ListeningAsk: Block = {
  slug: 'listeningAsk',
  interfaceName: 'ListeningAskBlock',
  labels: { singular: 'Listening question', plural: 'Listening questions' },
  fields: [
    {
      name: 'question',
      type: 'text',
      required: true,
      label: 'Question code or address',
      admin: { description: 'From the question’s page in the Portal (Audience Listening): its 16-character code, or its address (…/listens/<code>).' },
      validate: (value: string | null | undefined) => (publicIdFromInput(value) ? true : PUBLIC_ID_MESSAGE),
    },
    {
      name: 'variant',
      type: 'radio',
      required: true,
      defaultValue: 'story',
      options: [
        { label: 'In the story: a short box to type or record an answer', value: 'story' },
        { label: 'After an episode or video: leads with the microphone', value: 'voice' },
      ],
      admin: { layout: 'vertical' },
    },
    {
      name: 'recipient',
      type: 'text',
      maxLength: 60,
      admin: {
        condition: (_data, sibling) => sibling?.variant === 'voice',
        description: 'Who receives the message, e.g. "Mary" or "the Unearthing Florida team". Empty uses the person who asked the question, or WUWF.',
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
