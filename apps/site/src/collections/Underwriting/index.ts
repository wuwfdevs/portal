import { fundableCollection } from './fundable'

export { Sponsors } from './Sponsors'
export { UnderwritingAgreements } from './UnderwritingAgreements'

export const Fellowships = fundableCollection({
  slug: 'fellowships',
  singular: 'Fellowship',
  plural: 'Fellowships',
  description: 'A year of reporting on one subject, usually funded. Its hub page lists everything made through it.',
  extraFields: [
    { name: 'mission', type: 'textarea' },
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
  description: 'An ongoing WUWF production, such as a podcast or live-music series.',
})
