import type { CollectionConfig } from 'payload'

import { SITE_ROLES } from '@wuwf/portal-contracts'

import { userCan } from '../../access/permissions'

/**
 * Staff only. Almost every user is provisioned from the Portal when they open the website tool
 * (src/lib/portal/sso.ts), carrying their roles. The one exception is a local break-glass
 * administrator: the first user created through Payload's own screen, which is given every role.
 * Public audience accounts are not Payload users; they live in Supabase Auth.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: ({ req }) => Boolean(req.user),
    create: ({ req }) => userCan(req.user, 'users.manage'),
    delete: ({ req }) => userCan(req.user, 'users.manage'),
    // Staff can read the staff directory (to pick contributors, assign work); nobody outside can.
    read: ({ req }) => Boolean(req.user),
    update: ({ req, id }) => userCan(req.user, 'users.manage') || req.user?.id === id,
  },
  admin: {
    defaultColumns: ['name', 'email', 'roles'],
    useAsTitle: 'name',
  },
  auth: true,
  fields: [
    { name: 'name', type: 'text' },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      options: SITE_ROLES.map((r) => ({ label: r, value: r })),
      defaultValue: [],
      saveToJWT: true,
      access: {
        // Roles come from the Portal (or an administrator); a person can never grant themselves one.
        update: ({ req }) => userCan(req.user, 'users.manage'),
        create: ({ req }) => userCan(req.user, 'users.manage'),
      },
      admin: { description: 'Set by the Portal when this person opens the website tool.' },
    },
    {
      name: 'portalUserId',
      type: 'text',
      unique: true,
      index: true,
      access: { update: () => false },
      admin: { readOnly: true, position: 'sidebar', description: 'The Portal profile this user was provisioned from.' },
    },
  ],
  hooks: {
    beforeValidate: [
      async ({ data, operation, req }) => {
        // The very first user is the local break-glass administrator.
        if (operation !== 'create' || !data) return data
        const existing = await req.payload.count({ collection: 'users', overrideAccess: true, req })
        if (existing.totalDocs === 0) return { ...data, roles: [...SITE_ROLES] }
        return data
      },
    ],
  },
  timestamps: true,
}
