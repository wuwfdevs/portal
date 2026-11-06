import type { GlobalConfig } from 'payload'

import { requirePermission } from '@/access/permissions'
import { validateSupportHref } from '@/lib/support-link'

import { revalidateHomepage } from './hooks/revalidateHomepage'

const publishedOnly = { _status: { equals: 'published' } }

/**
 * The home page (boards 1 and 2). Its structure is fixed by a developer; staff choose what fills it. Anything left empty is
 * filled from the newest published work, so the page is never blank and never needs a story to be picked to stay current.
 * Making something appear on the front page is publishing, so it takes publish permission.
 */
export const Homepage: GlobalConfig = {
  slug: 'homepage',
  admin: { group: 'Pages & hubs', livePreview: { url: '/' } },
  label: 'Home page',
  access: { read: () => true, update: requirePermission('content.publish') },
  hooks: { afterChange: [revalidateHomepage] },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Emergency coverage',
          description: 'When switched on, this appears at the very top of the home page, above everything else. Switch it off to remove it.',
          fields: [
            {
              name: 'emergency',
              type: 'group',
              fields: [
                { name: 'active', type: 'checkbox', defaultValue: false, label: 'Show emergency coverage' },
                {
                  name: 'label',
                  type: 'text',
                  defaultValue: 'Emergency coverage',
                  admin: { condition: (_, s) => Boolean(s?.active), description: 'The small label above the headline.' },
                },
                {
                  name: 'headline',
                  type: 'text',
                  admin: { condition: (_, s) => Boolean(s?.active) },
                  validate: (value: string | null | undefined, { siblingData }: { siblingData?: { active?: boolean } }) =>
                    siblingData?.active && !value?.trim() ? 'Write the headline, or switch emergency coverage off.' : true,
                },
                { name: 'body', type: 'textarea', admin: { condition: (_, s) => Boolean(s?.active), description: 'A sentence or two. Plain text.' } },
                {
                  type: 'row',
                  fields: [
                    { name: 'linkLabel', type: 'text', admin: { width: '40%', condition: (_, s) => Boolean(s?.active), description: 'e.g. "Live updates"' } },
                    {
                      name: 'linkHref',
                      type: 'text',
                      validate: validateSupportHref,
                      admin: {
                        width: '60%',
                        condition: (_, s) => Boolean(s?.active),
                        description: 'A page on this site (/live-updates/storm), a secure https:// address, or mailto:. Leave empty for no link.',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Lead story',
          fields: [
            {
              name: 'lead',
              type: 'relationship',
              relationTo: 'posts',
              filterOptions: publishedOnly,
              admin: { description: 'The large story at the top. Leave empty to lead with the newest published story.' },
            },
            { name: 'leadKicker', type: 'text', admin: { description: 'Optional small label above the headline, e.g. "After Isaias". Leave empty to show the story\'s section.' } },
          ],
        },
        {
          label: 'Top stories',
          fields: [
            {
              name: 'topStories',
              type: 'relationship',
              relationTo: 'posts',
              hasMany: true,
              maxRows: 5,
              filterOptions: publishedOnly,
              admin: { description: 'Up to five, in the order shown beside the lead. Any you leave empty are filled with the newest published stories.' },
            },
          ],
        },
        {
          label: 'Fellowship feature',
          fields: [
            {
              name: 'fellowshipFeature',
              type: 'group',
              fields: [
                { name: 'enabled', type: 'checkbox', defaultValue: false, label: 'Show the fellowship feature' },
                { name: 'fellowship', type: 'relationship', relationTo: 'fellowships', admin: { condition: (_, s) => Boolean(s?.enabled) } },
                {
                  name: 'story',
                  type: 'relationship',
                  relationTo: 'posts',
                  filterOptions: publishedOnly,
                  admin: { condition: (_, s) => Boolean(s?.enabled), description: 'The story to feature. Leave empty to feature the fellowship\'s newest.' },
                },
              ],
            },
          ],
        },
        {
          label: 'Local news',
          fields: [
            {
              name: 'localNews',
              type: 'group',
              fields: [
                { name: 'heading', type: 'text', defaultValue: 'Northwest Florida' },
                { name: 'section', type: 'relationship', relationTo: 'sections', admin: { description: 'Which section fills this list. Leave empty for the newest stories from any section.' } },
                { name: 'count', type: 'number', defaultValue: 6, min: 3, max: 12, admin: { description: 'How many stories to list (3 to 12).' } },
              ],
            },
          ],
        },
        {
          label: 'Short videos',
          description: 'A row of the newest published short videos. It is left out while there are none.',
          fields: [
            {
              name: 'videoRow',
              type: 'group',
              fields: [
                { name: 'enabled', type: 'checkbox', defaultValue: true, label: 'Show the short-video row' },
                {
                  name: 'series',
                  type: 'relationship',
                  relationTo: 'series',
                  admin: { condition: (_, s) => Boolean(s?.enabled), description: "Optional. Put this series' videos first, e.g. during a big story. Leave empty for the newest from every series." },
                },
                {
                  name: 'count',
                  type: 'number',
                  defaultValue: 6,
                  min: 3,
                  max: 10,
                  admin: { condition: (_, s) => Boolean(s?.enabled), description: 'How many videos the row holds (3 to 10).' },
                },
              ],
            },
          ],
        },
        {
          label: 'Podcasts',
          description: 'One show with its newest episode, and three more shows beside it. Only shows listed in the podcast directory appear. It is left out while no listed show has an episode.',
          fields: [
            {
              name: 'podcasts',
              type: 'group',
              fields: [
                { name: 'enabled', type: 'checkbox', defaultValue: true, label: 'Show the podcasts section' },
                {
                  name: 'featuredShow',
                  type: 'relationship',
                  relationTo: 'productions',
                  filterOptions: { and: [{ kind: { equals: 'original' } }, { listed: { equals: true } }] },
                  admin: { condition: (_, s) => Boolean(s?.enabled), description: 'Optional. The show to feature. Leave empty to feature the show with the newest episode.' },
                },
              ],
            },
          ],
        },
        {
          label: 'RadioLive and Unearthing Florida',
          description: 'Two panels side by side. RadioLive shows the next show and the newest recorded set, from the RadioLive shows. Unearthing Florida shows an episode of the series chosen on the Unearthing Florida page. Each is left out while it has nothing to show.',
          fields: [
            {
              name: 'radioLive',
              type: 'group',
              label: 'RadioLive',
              fields: [{ name: 'enabled', type: 'checkbox', defaultValue: true, label: 'Show the RadioLive panel' }],
            },
            {
              name: 'unearthing',
              type: 'group',
              label: 'Unearthing Florida',
              fields: [
                { name: 'enabled', type: 'checkbox', defaultValue: true, label: 'Show the Unearthing Florida panel' },
                {
                  name: 'episode',
                  type: 'relationship',
                  relationTo: 'posts',
                  filterOptions: publishedOnly,
                  admin: {
                    condition: (_, s) => Boolean(s?.enabled),
                    description: "Optional. An Unearthing Florida episode to feature. Leave empty for the episode featured on the Unearthing Florida page, else the newest. A story from another series is ignored.",
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
