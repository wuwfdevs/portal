import { bodyEditor } from '../../../fields/bodyEditor'
import { defineSection, sectionFields } from '../fields'

/**
 * Text: the story-body editor in a band (PAGE-BLOCKS.md → Block catalogue). Its rich text can hold the two restricted blocks (preserved
 * HTML, administrators only; a script widget, publishers only), and Payload does not enforce a block's access inside rich text, so the
 * pages collection's `restrictedBlocksGuard` names `sections` and walks into every section's data (`lib/legacy-html-guard`). Any block
 * that takes rich text goes through the same guard; `restrictedBlocksGuard.test.ts` fails when a block uses `bodyEditor` and the pages
 * collection does not guard `sections`.
 */
export const Text = defineSection({
  slug: 'sectionText',
  singular: 'Text',
  plural: 'Text',
  group: 'Text',
  fields: sectionFields({
    own: [{ name: 'body', type: 'richText', editor: bodyEditor, label: 'Body', admin: { description: 'Text, pictures, audio, video and embeds: the same blocks as a story.' } }],
  }),
})
