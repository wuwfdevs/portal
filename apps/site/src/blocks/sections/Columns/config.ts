import { validations } from 'payload'

import type { Config } from '@/payload-types'

import { defineSection, sectionFields } from '../fields'
import { INLINE_SLUGS } from '../inline'

export const COLUMNS_VARIANTS = [
  { label: 'Equal columns', value: 'equal' },
  { label: 'The left column twice as wide', value: 'left-wide' },
  { label: 'The right column twice as wide', value: 'right-wide' },
] as const

/**
 * Columns: two or three columns side by side on a wide screen (one under another on a phone, in the same order), each holding a short list of
 * other sections (PAGE-BLOCKS.md → Columns). The tone and the spacing are the Columns block's: what it holds draws without a band of its own.
 * One level only (Columns cannot hold Columns), and only the sections in `inline.ts`.
 */
export const Columns = defineSection({
  slug: 'sectionColumns',
  singular: 'Columns',
  plural: 'Columns',
  group: 'Layout',
  fields: sectionFields({
    variants: COLUMNS_VARIANTS,
    own: [
      {
        name: 'columns',
        type: 'array',
        minRows: 2,
        maxRows: 3,
        admin: { description: 'Two or three columns. The wider-column layouts use the first two.' },
        fields: [
          {
            name: 'sections',
            type: 'blocks',
            blocks: [],
            blockReferences: [...INLINE_SLUGS] as Array<keyof Config['blocks']>,
            admin: { initCollapsed: true },
            // Stored as JSON, a blocks field keeps a block type it does not list, so the rule is checked here: only the sections in `inline.ts`.
            validate: async (value: unknown, options: unknown) => {
              const base = await validations.blocks(value as never, options as never)
              if (base !== true) return base
              const bad = (Array.isArray(value) ? value : []).find((b: { blockType?: string } | null) => !(INLINE_SLUGS as readonly string[]).includes(b?.blockType ?? ''))
              return bad ? `A ${(bad as { blockType?: string }).blockType ?? 'section'} cannot go inside columns. Columns hold text, cards, figures, check lists, notes, quotes, tables, questions, steps and illustrations.` : true
            },
          },
        ],
      },
    ],
  }),
})
