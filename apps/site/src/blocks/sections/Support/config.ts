import { defineSection, sectionFields } from '../fields'

/**
 * Support: hands the visitor to WUWF's donation form (PAGE-BLOCKS.md → Block catalogue). It collects nothing: the button is a link to the
 * form whose address is the `Giving pages` global's monthly form (read through `getCachedGlobal`, so saving it refreshes every page that
 * holds this block). With no address set the block draws nothing, as the giving pages do today. When the giving pages move into
 * sections (phase 4) the address moves to the giving settings global and only that read changes.
 */
export const Support = defineSection({
  slug: 'sectionSupport',
  singular: 'Support',
  plural: 'Support bands',
  group: 'Action',
  fields: sectionFields({
    own: [
      { name: 'label', type: 'text', admin: { description: 'The button. Empty: "Become a member".' } },
      { name: 'note', type: 'text', admin: { description: 'A line under the button, e.g. "You will go to WUWF\'s secure donation form."' } },
    ],
  }),
})
