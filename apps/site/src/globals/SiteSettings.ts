import type { GlobalConfig } from 'payload'

import { requirePermission } from '@/access/permissions'
import { revalidateSiteSettings } from './hooks/revalidateSiteSettings'

/**
 * Site-wide settings that pages link to. Kept as references, not typed-in URLs, so a link can never point at a
 * page that does not exist.
 */
export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site settings',
  access: { read: () => true, update: requirePermission('settings.manage') },
  hooks: { afterChange: [revalidateSiteSettings] },
  fields: [
    {
      name: 'embedHosts',
      type: 'array',
      label: 'Approved embed sites',
      admin: {
        description:
          'Sites that load inside a story without the reader clicking, in addition to the built-in list (YouTube, Vimeo, Spotify, Apple Podcasts, SoundCloud, DocumentCloud, Datawrapper, Flourish, ArcGIS, the NPR player, Brightcove, Rumble). Any other public https site can still be embedded, but only loads after the reader clicks. The same list decides which script widgets load by themselves. Exact hostname, https only. Only add sites you trust: an embed runs that site\'s code in a frame on our page.',
      },
      fields: [
        {
          name: 'host',
          type: 'text',
          required: true,
          validate: (value: string | null | undefined) =>
            typeof value === 'string' && /^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i.test(value.trim())
              ? true
              : 'Enter a hostname such as maps.example.org (no https://, no path).',
        },
      ],
    },
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
