import { bodyEditor } from '../../fields/bodyEditor'
import { pathField } from '../../fields/path'
import { restrictedBlocksGuard } from '../../hooks/restrictedBlocksGuard'
import { revalidateShow, revalidateShowDelete } from '../../hooks/revalidateShow'
import { showPathBeforeChange } from '../../hooks/showPath'
import { fundableCollection } from './fundable'

export { Sponsors } from './Sponsors'
export { UnderwritingAgreements } from './UnderwritingAgreements'

export const Fellowships = fundableCollection({
  slug: 'fellowships',
  singular: 'Fellowship',
  plural: 'Fellowships',
  description: 'A year of reporting on one subject, usually funded. Its hub page lists everything made through it.',
  extraFields: [
    {
      name: 'eyebrow',
      type: 'text',
      defaultValue: 'A WUWF reporting fellowship',
      admin: { description: 'The small label above the title on the hub page.' },
    },
    {
      name: 'missionHeadline',
      type: 'text',
      admin: { description: 'One sentence that says what the fellowship is for. Shown large above the mission.' },
    },
    { name: 'mission', type: 'textarea', admin: { description: 'A paragraph under the headline.' } },
    {
      name: 'focusAreas',
      type: 'array',
      maxRows: 6,
      labels: { singular: 'Focus area', plural: 'Focus areas' },
      admin: { description: 'The two or three subjects the fellowship covers, shown under the mission.' },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'blurb', type: 'text', admin: { description: 'A few words, e.g. "What it costs to stay".' } },
      ],
    },
    { name: 'fellow', type: 'relationship', relationTo: 'contributors' },
    { name: 'termStartsOn', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
    { name: 'termEndsOn', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
  ],
})

export const Series = fundableCollection({
  slug: 'series',
  singular: 'Series',
  plural: 'Series',
  description: 'An editorial series such as "After Isaias". May carry an agreement; many do not.',
})

export const Productions = fundableCollection({
  slug: 'productions',
  singular: 'Original production',
  plural: 'Original productions',
  description: 'An ongoing WUWF production: a show or podcast. Its page lists its episodes; an episode is a story with audio attached to the show.',
  beforeChange: [showPathBeforeChange, restrictedBlocksGuard(['description'])],
  afterChange: [revalidateShow],
  afterDelete: [revalidateShowDelete],
  extraFields: [
    pathField,
    { name: 'tagline', type: 'text', admin: { description: 'The line under the name, e.g. "A Coastal Futures podcast · WUWF".' } },
    { name: 'schedule', type: 'text', admin: { description: 'When it airs or how often it comes out, e.g. "Sundays at 7 p.m. on WUWF-HD2" or "New episodes every other Friday".' } },
    { name: 'hosts', type: 'relationship', relationTo: 'contributors', hasMany: true },
    { name: 'description', type: 'richText', editor: bodyEditor, admin: { description: 'About the show. Shown on its page.' } },
    { name: 'listed', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar', description: 'Show this in the podcast directory.' } },
    {
      name: 'legacy',
      type: 'group',
      label: 'From Grove',
      admin: { position: 'sidebar', description: 'Set by the migration. Leave empty for new shows.' },
      fields: [
        { name: 'legacyPath', type: 'text', unique: true, index: true },
        { name: 'groveId', type: 'text', unique: true, index: true },
      ],
    },
  ],
})
