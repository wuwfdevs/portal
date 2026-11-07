import type { CollectionConfig } from 'payload'

import { requirePermission } from '../access/permissions'

/**
 * Which version of a member's private feed address is current, per show (phase 7d). A row exists only once a member has reset a
 * feed; without one the version is 1. The address itself is never stored: it is signed from the profile, the show and this version.
 * Server only: the site writes it; membership staff may look, for support.
 */
export const MemberFeeds: CollectionConfig = {
  slug: 'member-feeds',
  labels: { singular: 'Member feed reset', plural: 'Member feed resets' },
  access: { read: requirePermission('membership.manage'), create: () => false, update: () => false, delete: requirePermission('membership.manage') },
  admin: {
    group: 'Membership',
    defaultColumns: ['account', 'production', 'version', 'updatedAt'],
    description: 'Members who have reset a private feed. Each reset stops every earlier address for that show.',
  },
  fields: [
    { name: 'account', type: 'relationship', relationTo: 'audience-profiles', required: true, index: true, admin: { readOnly: true } },
    { name: 'production', type: 'relationship', relationTo: 'productions', required: true, index: true, admin: { readOnly: true } },
    { name: 'version', type: 'number', required: true, min: 1, admin: { readOnly: true } },
  ],
}
