import { actionsField, defineSection, sectionFields } from '../fields'

export const FEATURE_VARIANTS = [
  { label: 'Hero: big headline, picture below', value: 'hero' },
  { label: 'Split: picture one side, words the other', value: 'split' },
] as const

/** The picture shapes the split layout offers: named, never a size. */
export const FEATURE_RATIOS = [
  { label: 'Portrait (4:5)', value: 'portrait' },
  { label: 'Standard (4:3)', value: 'standard' },
  { label: 'Wide (16:9)', value: 'wide' },
] as const

/**
 * Feature: the one thing a page leads with (PAGE-BLOCKS.md → Block catalogue). Typed fields: a label, a headline, a line, up to two
 * buttons, a picture, and audio the visitor can play in the site's one player. `hero` and `split` are layouts over the same fields; the
 * split's `ratio` and `imageSide` are read only by it (a hidden field keeps its data and is not validated).
 */
export const Feature = defineSection({
  slug: 'sectionFeature',
  singular: 'Feature',
  plural: 'Features',
  group: 'Lead',
  fields: sectionFields({
    heading: false,
    variants: FEATURE_VARIANTS,
    own: [
      { name: 'label', type: 'text', admin: { description: 'A short line above the headline: "Next show · Thursday, Dec. 3".' } },
      { name: 'headline', type: 'text', required: true },
      { name: 'line', type: 'textarea', admin: { description: 'One or two sentences under the headline.' } },
      actionsField(),
      { name: 'image', type: 'upload', relationTo: 'media', admin: { description: 'Its description (alt text) is what a screen reader says.' } },
      { name: 'audio', type: 'upload', relationTo: 'audio', admin: { description: 'Optional. A play button that hands the audio to the site\'s player.' } },
      {
        name: 'ratio',
        type: 'select',
        defaultValue: 'standard',
        options: FEATURE_RATIOS.map((r) => ({ label: r.label, value: r.value })),
        admin: { description: 'Split only.', condition: (_, sibling) => sibling?.variant === 'split' },
      },
      {
        name: 'imageSide',
        type: 'select',
        defaultValue: 'right',
        options: [
          { label: 'Picture on the right', value: 'right' },
          { label: 'Picture on the left', value: 'left' },
        ],
        admin: { description: 'Split only.', condition: (_, sibling) => sibling?.variant === 'split' },
      },
    ],
  }),
})
