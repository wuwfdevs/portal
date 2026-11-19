import type { GlobalConfig } from 'payload'

import { requirePermission } from '@/access/permissions'
import { revalidateTag } from '@/lib/revalidate'

import { area, group, href, list, text } from './fieldBuilders'

/**
 * Shared text (PAGE-BLOCKS.md phase 5). Words that more than one screen shows, or that belong to a screen that is not a page of sections:
 * the community calendar's guidelines, the membership appeal under a story and on the home page, and the explanation on every fellowship's page.
 * They were typed in code; an editor changes them here and every screen follows. Publishers edit it (Site settings is the administrator's).
 *
 * Read through `getCachedGlobal` (tag `global_shared-text`), so the save below reaches every page that shows a word of it.
 */
export const SharedText: GlobalConfig = {
  slug: 'shared-text',
  label: 'Shared text',
  admin: { description: 'The community calendar’s guidelines, the membership appeal and the fellowship explanation: words that appear on more than one page.' },
  access: { read: () => true, update: requirePermission('content.publish') },
  hooks: {
    afterChange: [
      ({ doc, req: { context } }) => {
        if (!context.disableRevalidate) revalidateTag('global_shared-text', 'max')
        return doc
      },
    ],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Community calendar guidelines',
          fields: [
            group(
              'calendarGuidelines',
              [
                text('title', { admin: { description: 'The panel’s heading on the event submission page.' } }),
                list(
                  'paragraphs',
                  [
                    text('lead', { admin: { description: 'Optional bold opening words, such as “Deadlines.”' } }),
                    area('text', { required: true, maxLength: 3000, admin: { description: 'An email address typed here becomes a link.' } }),
                  ],
                  { singular: 'Paragraph', plural: 'Paragraphs', max: 12 },
                ),
              ],
              'Shown on the event submission page, closed until a visitor opens it. With no paragraphs the panel is not drawn.',
            ),
          ],
        },
        {
          label: 'Membership appeal',
          fields: [
            group(
              'membershipAppeal',
              [
                area('text', { maxLength: 300, admin: { description: 'One sentence. Empty hides the appeal.' } }),
                text('buttonLabel', { maxLength: 40 }),
                href('buttonHref', 'Button address', '/support'),
              ],
              'The band under every story and on the home page.',
            ),
          ],
        },
        {
          label: 'Fellowship explanation',
          fields: [
            group(
              'fellowshipPolicy',
              [
                text('title'),
                list(
                  'items',
                  [text('term', { required: true, maxLength: 80 }), area('text', { required: true, maxLength: 400 })],
                  { singular: 'Item', plural: 'Items', max: 6 },
                ),
                text('linkLabel', { admin: { description: 'The link to the editorial independence policy (chosen in Site settings).' } }),
              ],
              'On every fellowship’s page, under its work. With no items the section is not drawn.',
            ),
          ],
        },
      ],
    },
  ],
}
