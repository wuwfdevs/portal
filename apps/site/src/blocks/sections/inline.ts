/**
 * The sections a Columns block may hold (PAGE-BLOCKS.md → Columns). A short list on purpose: sections that read well in a column and are not a
 * page's opening (a hero is an `h1`; Columns cannot hold Columns, so nesting is one level). Forms, pickers, data blocks and the sponsor-only
 * blocks stay on the page itself. This file imports nothing, so a config can read it.
 */
export const INLINE_SLUGS = [
  'sectionText',
  'sectionCards',
  'sectionStats',
  'sectionCheckList',
  'sectionCallout',
  'sectionQuotes',
  'sectionTable',
  'sectionQuestions',
  'sectionSteps',
  'sectionIllustration',
] as const
