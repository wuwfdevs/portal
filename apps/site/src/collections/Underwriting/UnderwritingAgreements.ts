import type { CollectionConfig } from 'payload'

import { requirePermission } from '../../access/permissions'
import { revalidateAgreement, revalidateAgreementDelete } from '../../hooks/revalidateUnderwriting'
import { validateTerm } from '../../lib/underwriting/resolve'

const dateOnly = { date: { pickerAppearance: 'dayOnly' as const, displayFormat: 'yyyy-MM-dd' } }

/**
 * An underwriting agreement: the approved acknowledgment language, the term, and where it applies.
 * Attached to fellowships, series and productions (from their side), never pasted into a story.
 * Rendered only through lib/underwriting/resolve.ts; the public has no direct read access.
 */
export const UnderwritingAgreements: CollectionConfig = {
  slug: 'underwriting-agreements',
  labels: { singular: 'Underwriting agreement', plural: 'Underwriting agreements' },
  access: {
    create: requirePermission('sponsorship.manage'),
    update: requirePermission('sponsorship.manage'),
    delete: requirePermission('sponsorship.manage'),
    read: ({ req }) => Boolean(req.user),
  },
  admin: {
    group: 'Commercial',
    useAsTitle: 'label',
    defaultColumns: ['label', 'sponsor', 'kind', 'startsOn', 'endsOn', 'active'],
    description: 'Changing the wording here changes every page the agreement reaches.',
  },
  fields: [
    {
      name: 'label',
      type: 'text',
      required: true,
      admin: { description: 'For staff, e.g. "Example Foundation — Coastal Futures, 2026–27".' },
    },
    { name: 'sponsor', type: 'relationship', relationTo: 'sponsors', required: true },
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'recognition',
      options: [
        { label: 'Funding recognition (work published during the term carries the line forever)', value: 'recognition' },
        { label: 'Campaign (shown only while the term runs)', value: 'campaign' },
      ],
    },
    {
      name: 'text',
      type: 'textarea',
      required: true,
      admin: { description: 'The approved acknowledgment, exactly as it should appear.' },
    },
    {
      name: 'shortText',
      type: 'text',
      admin: { description: 'Optional short form for promo cards. If empty: "Supported in part by <sponsor>".' },
    },
    {
      name: 'textVersion',
      type: 'number',
      defaultValue: 1,
      access: { update: () => false, create: () => false },
      admin: { readOnly: true, position: 'sidebar', description: 'Increases each time the wording changes.' },
    },
    { name: 'startsOn', type: 'date', required: true, admin: { ...dateOnly, position: 'sidebar' } },
    {
      name: 'endsOn',
      type: 'date',
      admin: { ...dateOnly, position: 'sidebar', description: 'Leave empty for an open-ended term.' },
    },
    { name: 'active', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
    {
      name: 'formats',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Web', value: 'web' },
        { label: 'Audio', value: 'audio' },
        { label: 'Video', value: 'video' },
      ],
      admin: { description: 'Empty means every format.' },
    },
    {
      name: 'placements',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Article', value: 'article' },
        { label: 'Promo card', value: 'card' },
        { label: 'Episode page', value: 'episode' },
        { label: 'Video', value: 'video' },
        { label: 'Hub page', value: 'hub' },
      ],
      admin: { description: 'Empty means every placement.' },
    },
    {
      name: 'independenceTerms',
      type: 'textarea',
      admin: { description: 'Internal. The editorial-independence terms agreed with the funder.' },
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        const start = typeof data.startsOn === 'string' ? data.startsOn.slice(0, 10) : ''
        const end = typeof data.endsOn === 'string' ? data.endsOn.slice(0, 10) : null
        const problem = validateTerm(start, end)
        if (problem) throw new Error(problem)
        return data
      },
    ],
    beforeChange: [
      ({ data, originalDoc, operation }) => {
        // Bump the version whenever the approved wording changes, so a change is traceable.
        if (operation === 'update' && originalDoc && (data.text !== originalDoc.text || data.shortText !== originalDoc.shortText)) {
          data.textVersion = (originalDoc.textVersion ?? 1) + 1
        }
        return data
      },
    ],
    afterChange: [revalidateAgreement],
    afterDelete: [revalidateAgreementDelete],
  },
}
