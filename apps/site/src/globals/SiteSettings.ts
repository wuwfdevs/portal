import type { GlobalConfig } from 'payload'

import { requirePermission } from '@/access/permissions'

/**
 * Site-wide settings that pages link to. Kept as references, not typed-in URLs, so a link can never point at a
 * page that does not exist.
 */
export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site settings',
  access: { read: () => true, update: requirePermission('settings.manage') },
  fields: [
    {
      name: 'independencePolicy',
      type: 'relationship',
      relationTo: 'pages',
      admin: {
        description:
          'The editorial independence policy. Underwriting acknowledgments link to it. If empty, no link is shown.',
      },
    },
  ],
}
