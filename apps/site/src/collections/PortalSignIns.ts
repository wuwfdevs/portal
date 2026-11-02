import type { CollectionConfig } from 'payload'

/**
 * Identity tokens already used. A token carries a unique `jti`; recording it with a unique constraint is what
 * makes a captured sign-in link worthless after the first use. Never readable or writable through the API:
 * only the sign-in flow touches it, with the Local API. Expired rows are swept on each sign-in.
 */
export const PortalSignIns: CollectionConfig = {
  slug: 'portal-sign-ins',
  access: { read: () => false, create: () => false, update: () => false, delete: () => false },
  admin: { hidden: true },
  timestamps: true,
  fields: [
    { name: 'jti', type: 'text', required: true, unique: true, index: true },
    { name: 'portalUserId', type: 'text', required: true },
    { name: 'expiresAt', type: 'date', required: true, index: true },
  ],
}
