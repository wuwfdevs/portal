import type { GlobalConfig } from 'payload'

import { requirePermission } from '@/access/permissions'
import { revalidatePath, revalidateTag } from '@/lib/revalidate'
import { validateHref } from '@/lib/section-links'

/**
 * The site banner: one message across the top of the site, an emergency or a notice that matters but is not urgent, on the home page only or on every page. It was the
 * Home page global's Banner tab; it is its own global now that the home page is a page of sections (PAGE-BLOCKS.md → Home), because a banner is the site's, not one page's.
 * Publishers edit it (making a message appear on the site is publishing), not only administrators, which is why it is not part of Site settings.
 *
 * Read through `getCachedGlobal` (tag `global_site-banner`) by the layout and the home page's shell, so the save below reaches every page that read it. The rules are the
 * pure `lib/banner`.
 */
export const SiteBanner: GlobalConfig = {
  slug: 'site-banner',
  label: 'Site banner',
  admin: {
    description:
      'One message across the top of the site: an emergency, or a notice that matters but is not urgent. Choose whether it appears on the home page only or on every page. Switch it off to remove it. Saving refreshes the pages straight away.',
  },
  access: { read: () => true, update: requirePermission('content.publish') },
  hooks: {
    afterChange: [
      ({ doc, req: { payload, context } }) => {
        if (!context.disableRevalidate) {
          payload.logger.info('Revalidating the site banner')
          revalidateTag('global_site-banner', 'max')
          revalidatePath('/')
          revalidatePath('/', 'layout')
        }
        return doc
      },
    ],
  },
  fields: [
    { name: 'active', type: 'checkbox', defaultValue: false, label: 'Show the banner' },
    {
      type: 'row',
      fields: [
        {
          name: 'scope',
          type: 'select',
          defaultValue: 'home',
          required: true,
          label: 'Where it appears',
          options: [
            { label: 'Home page only', value: 'home' },
            { label: 'Every page', value: 'all' },
          ],
          admin: { width: '50%', condition: (_, s) => Boolean(s?.active) },
        },
        {
          name: 'style',
          type: 'select',
          defaultValue: 'emergency',
          required: true,
          label: 'Style',
          options: [
            { label: 'Emergency (strong blue band)', value: 'emergency' },
            { label: 'Notice (quiet grey band)', value: 'notice' },
          ],
          admin: { width: '50%', condition: (_, s) => Boolean(s?.active) },
        },
      ],
    },
    {
      name: 'label',
      type: 'text',
      admin: { condition: (_, s) => Boolean(s?.active), description: 'The small label above the headline. Leave empty for "Emergency coverage" or "Notice", by the style.' },
    },
    {
      name: 'headline',
      type: 'text',
      admin: { condition: (_, s) => Boolean(s?.active) },
      validate: (value: string | null | undefined, { siblingData }: { siblingData?: { active?: boolean } }) =>
        siblingData?.active && !value?.trim() ? 'Write the headline, or switch the banner off.' : true,
    },
    { name: 'body', type: 'textarea', admin: { condition: (_, s) => Boolean(s?.active), description: 'A sentence or two. Plain text.' } },
    {
      type: 'row',
      fields: [
        { name: 'linkLabel', type: 'text', admin: { width: '40%', condition: (_, s) => Boolean(s?.active), description: 'e.g. "Live updates"' } },
        {
          name: 'linkHref',
          type: 'text',
          validate: validateHref,
          admin: {
            width: '60%',
            condition: (_, s) => Boolean(s?.active),
            description: 'A page on this site (/live-updates/storm), a secure https:// address, or mailto:. Leave empty for no link.',
          },
        },
      ],
    },
  ],
}
