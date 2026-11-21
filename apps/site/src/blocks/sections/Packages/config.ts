import { defineSection, sectionFields } from '../fields'

/**
 * Packages (sponsor pages only): the new-sponsor packages, each with its price and what the same credits cost at the rate card. The
 * names, descriptions, prices and values are the Sponsorship settings (one change reaches every page); the words around them are this block's.
 */
export const Packages = defineSection({
  slug: 'sectionPackages',
  singular: 'Packages',
  plural: 'Packages',
  group: 'Collections',
  fields: sectionFields({
    own: [
      { name: 'packageLabel', type: 'text', admin: { description: 'Printed above each package number, e.g. "Package".' } },
      { name: 'note', type: 'textarea', admin: { description: 'Printed under the packages.' } },
    ],
  }),
})
