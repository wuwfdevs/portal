import type { CollectionConfig } from 'payload'

import { requirePermission } from '../access/permissions'

/**
 * A reader's profile on this site (phase 7b), keyed to their Supabase Auth user id. One of five identities that stay apart
 * (CLAUDE.md): it is not a staff account, not a donor record and not analytics. It holds no email address (Supabase Auth has
 * it) and no membership (7c links one, by a claim, never on an email match alone). Made at the first sign-in.
 *
 * Nothing here is readable or writable through the API by the public or by a reader: the site's server reads and writes it.
 * Membership staff may look, for support.
 */
export const AudienceProfiles: CollectionConfig = {
  slug: 'audience-profiles',
  labels: { singular: 'Reader account', plural: 'Reader accounts' },
  access: {
    read: requirePermission('membership.manage'),
    create: () => false,
    update: () => false,
    delete: requirePermission('membership.manage'),
  },
  admin: {
    group: 'Membership',
    useAsTitle: 'supabaseUserId',
    defaultColumns: ['supabaseUserId', 'firstSignInAt', 'lastSignInAt'],
    description: 'Readers who have signed in to wuwf.org. Email addresses stay in the sign-in service, not here.',
  },
  fields: [
    { name: 'supabaseUserId', type: 'text', required: true, unique: true, index: true, label: 'Sign-in id', admin: { readOnly: true } },
    { name: 'firstSignInAt', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'lastSignInAt', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
  ],
}
