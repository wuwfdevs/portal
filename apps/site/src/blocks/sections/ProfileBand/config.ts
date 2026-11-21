import { defineSection, sectionFields } from '../fields'

export const PROFILE_VARIANTS = [
  { label: 'About: words and a picture', value: 'about' },
  { label: 'Roster: people with a photo and a role', value: 'roster' },
] as const

/**
 * Profile band: who is behind it (PAGE-BLOCKS.md → Block catalogue). `about` reads `text` and `image`; `roster` reads `people`. The
 * fields of the other layout keep their data and are not read.
 */
export const ProfileBand = defineSection({
  slug: 'sectionProfileBand',
  singular: 'Profile band',
  plural: 'Profile bands',
  group: 'Collections',
  fields: sectionFields({
    variants: PROFILE_VARIANTS,
    own: [
      { name: 'text', type: 'textarea', admin: { description: 'About only. A blank line starts a new paragraph.', condition: (_, s) => s?.variant !== 'roster' } },
      { name: 'image', type: 'upload', relationTo: 'media', admin: { description: 'About only.', condition: (_, s) => s?.variant !== 'roster' } },
      {
        name: 'people',
        type: 'array',
        maxRows: 24,
        admin: { description: 'Roster only.', condition: (_, s) => s?.variant === 'roster' },
        fields: [
          { name: 'name', type: 'text', required: true },
          { name: 'role', type: 'text' },
          { name: 'photo', type: 'upload', relationTo: 'media' },
        ],
      },
    ],
  }),
})
