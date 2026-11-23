import { validateRecordingUrl } from '@/lib/radiolive/recording'

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
 * buttons, a picture, audio the visitor can play in the site's one player, and a video (a hosted address or a file in the video library) that takes the picture's
 * place: the picture is its still, with a play button, and nothing from the video's host loads until it is pressed. `hero` and `split` are layouts over the same fields; the
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
      {
        name: 'videoUrl',
        type: 'text',
        label: 'Video address',
        validate: validateRecordingUrl,
        admin: { description: 'Optional. The address of one video on YouTube or Vimeo. The picture becomes its still, with a play button; the video loads only when a visitor presses it.' },
      },
      { name: 'video', type: 'upload', relationTo: 'video', admin: { description: 'Optional. A file from the video library instead of an address. If both are set, the file plays.' } },
      { name: 'audio', type: 'upload', relationTo: 'audio', admin: { description: 'Optional. A play button that hands the audio to the site\'s player.' } },
      {
        name: 'aside',
        type: 'select',
        defaultValue: 'none',
        options: [
          { label: 'Nothing beside the words', value: 'none' },
          { label: 'Figures: up to four tiles beside the words', value: 'figures' },
          { label: 'A sample sentence in a card beside the words', value: 'quote' },
        ],
        admin: { description: 'A panel beside the words (for the split, when it has no picture).' },
      },
      {
        name: 'figures',
        type: 'array',
        maxRows: 4,
        admin: { condition: (_, s) => s?.aside === 'figures' },
        fields: [
          { name: 'value', type: 'text', required: true },
          { name: 'text', type: 'text', required: true },
        ],
      },
      { name: 'asideLabel', type: 'text', admin: { description: 'The small label on the card.', condition: (_, s) => s?.aside === 'quote' } },
      { name: 'asideText', type: 'textarea', admin: { description: 'The sentence, with its quotation marks if it has them.', condition: (_, s) => s?.aside === 'quote' } },
      { name: 'asideNote', type: 'textarea', admin: { description: 'Small print under the tiles or the card: a source, a note.', condition: (_, s) => s?.aside !== 'none' && Boolean(s?.aside) } },
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
