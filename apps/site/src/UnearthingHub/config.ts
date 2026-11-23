import type { GlobalConfig } from 'payload'

import { requirePermission } from '@/access/permissions'

import { revalidateUnearthingHub } from './hooks/revalidate'

/**
 * The Unearthing Florida hub's settings (board 11). Retiring: the hub is now the show's home page (a page of blocks at `/shows/unearthing-florida`) and `/unearthing-florida` redirects
 * to it; **retired (hubs redesign, slice 6):** nothing reads it for a visitor (the home page's Unearthing panel takes its show from the unearthing set's home page) and it is hidden, kept only because the migration that wrote the pages (`unearthing_home_page`) reads it on a database built from the migrations; it is dropped at the cleanup (PAGE-BLOCKS.md, phase 7). Then & now was dropped (hubs redesign, 2026-11-23). Showing something on a hub is publishing, so it takes publish permission.
 */
export const UnearthingHub: GlobalConfig = {
  slug: 'unearthing-hub',
  admin: { hidden: true, description: 'Retired: Unearthing Florida is the show\'s home page (a page of blocks). Nothing reads this any more; it is kept until the next cleanup because three migrations read it.' },
  label: 'Unearthing Florida hub',
  access: { read: () => true, update: requirePermission('content.publish') },
  hooks: { afterChange: [revalidateUnearthingHub] },
  fields: [
    {
      name: 'production',
      type: 'relationship',
      relationTo: 'productions',
      admin: { description: 'The Unearthing Florida production. Its title, summary and funding line are used; its episodes fill the hub. Until it is chosen, the hub says it is not set up.' },
    },
    { name: 'dateline', type: 'text', admin: { description: 'The small line above the title, e.g. "Northwest Florida to the Keys".' } },
    { name: 'about', type: 'textarea', admin: { description: 'The "About the project" box: who makes it, since when, when it airs.' } },
    {
      name: 'featured',
      type: 'relationship',
      relationTo: 'posts',
      admin: { description: 'The episode shown large with its player. Empty means the newest episode.' },
      filterOptions: { _status: { equals: 'published' } },
    },
  ],
}
