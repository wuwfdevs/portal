import type { GlobalConfig } from 'payload'

import { requirePermission } from '@/access/permissions'
import { validateCadenceChannelId, validateStreamUrl } from '@/lib/live/channels'
import { revalidateTag, revalidatePath } from '@/lib/revalidate'

/**
 * Listen live (board 26): the station's live streams and the "Other ways to listen" cards. The player on every page
 * and the /listen page read this; nothing about the streams is fixed in code.
 */
export const ListenLive: GlobalConfig = {
  slug: 'listen-live',
  label: 'Listen live',
  admin: { group: 'Site settings', livePreview: { url: '/schedule' } },
  access: { read: () => true, update: requirePermission('content.publish') },
  hooks: {
    afterChange: [
      ({ doc, req: { context } }) => {
        if (!context.disableRevalidate) {
          revalidateTag('global_listen-live', 'max')
          // The player and the header's Listen live button are on every page.
          revalidatePath('/', 'layout')
        }
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'channels',
      type: 'array',
      maxRows: 6,
      labels: { singular: 'Channel', plural: 'Channels' },
      admin: {
        description:
          'The live streams, in the order listeners see them. The first is the default. With no channels, the player, the Listen live button and the /listen page are hidden.',
        components: { RowLabel: '@/globals/ListenLiveRowLabel#ChannelRowLabel' },
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'name', type: 'text', required: true, maxLength: 60, admin: { width: '60%', description: 'e.g. "WUWF 88.1".' } },
            { name: 'short', type: 'text', maxLength: 20, admin: { width: '40%', description: 'For the player bar, e.g. "88.1". Empty uses the name.' } },
          ],
        },
        {
          name: 'streamUrl',
          type: 'text',
          required: true,
          validate: validateStreamUrl,
          admin: { description: 'The stream’s https address from StreamGuys, e.g. https://wuwf.streamguys1.com/WUWFFM.mp3.' },
        },
        {
          name: 'cadenceChannelId',
          type: 'text',
          label: 'Cadence channel ID',
          validate: validateCadenceChannelId,
          admin: {
            description:
              'Where "On now" and "Up next" come from: the channel’s ID in NPR Cadence (it appears in the address of Cadence’s schedule widget, after channelId=). Empty shows no schedule for this channel.',
          },
        },
        { name: 'description', type: 'text', maxLength: 140, admin: { description: 'One line, e.g. "News and information from NPR and WUWF."' } },
      ],
    },
    {
      name: 'otherWays',
      type: 'array',
      label: 'Other ways to listen',
      maxRows: 6,
      labels: { singular: 'Way', plural: 'Ways' },
      admin: { description: 'Cards under the player: on the radio, the app, smart speakers. Empty hides the section.' },
      fields: [
        { name: 'title', type: 'text', required: true, maxLength: 60 },
        { name: 'text', type: 'textarea', required: true, maxLength: 300 },
        {
          type: 'row',
          fields: [
            { name: 'linkLabel', type: 'text', maxLength: 40, admin: { width: '40%' } },
            {
              name: 'linkUrl',
              type: 'text',
              admin: { width: '60%', description: 'A page on this site ("/podcasts") or a full https address.' },
              validate: (value: string | null | undefined) => {
                if (!value) return true
                if (value.startsWith('/') && !value.startsWith('//')) return true
                try {
                  return new URL(value).protocol === 'https:' ? true : 'Use https.'
                } catch {
                  return 'Use a page on this site ("/podcasts") or a full https:// address.'
                }
              },
            },
          ],
        },
      ],
    },
  ],
}
