import type { ArrayField, GlobalConfig } from 'payload'

import { requireAnyPermission } from '@/access/permissions'
import { artworkSize, PLACEMENTS, TILE_ALT_MAX } from '@/lib/placements/registry'
import { validateSupportHref } from '@/lib/support-link'
import { revalidatePath } from '@/lib/revalidate'

/**
 * What fills the fixed sponsor and promotion places on the public pages (`lib/placements/registry.ts` lists the places; `PLACEMENTS.md` is
 * the design). Today staff enter each tile here by hand: the picture, where it goes, who it is for and when it runs. This is the
 * interim source, the way the underwriting agreements are for acknowledgments; once the Portal holds the deal, entitlements arrive behind
 * the same placement keys and this global becomes the house-promotion fallback and the manual override. Nothing here books, bills or
 * proves delivery. Saving it refreshes the pages that carry a placement.
 */

/** Corporate support (who sell the placements) and publishers (who run the home page and its house promotions) may edit; nobody else. */
const canEditPlacements = requireAnyPermission('sponsorship.manage', 'content.publish')

const RAIL = PLACEMENTS['home.rail']
const BAND = PLACEMENTS['home.band']

/** The fields of one tile. `extra` adds fields a shape needs beyond these (a banner's phone picture). */
function tileFields(artwork: string, extra: ArrayField['fields'] = []): ArrayField['fields'] {
  return [
    {
      type: 'row',
      fields: [
        {
          name: 'kind',
          type: 'select',
          required: true,
          defaultValue: 'sponsor',
          options: [
            { label: 'Sponsor (shown with "Sponsor message")', value: 'sponsor' },
            { label: 'House promotion (WUWF\'s own; no label)', value: 'house' },
          ],
          admin: { width: '45%', description: 'A paid or sponsored message is always a Sponsor. Choose House promotion only for WUWF\'s own pages, apps and campaigns.' },
        },
        {
          name: 'sponsor',
          type: 'text',
          maxLength: 80,
          admin: { width: '55%', condition: (_, s) => s?.kind !== 'house', description: 'The sponsor\'s name as it should be credited.' },
          validate: (value: string | null | undefined, { siblingData }: { siblingData?: { kind?: string } }) =>
            siblingData?.kind !== 'house' && !value?.trim() ? 'Enter the sponsor\'s name, or choose House promotion.' : true,
        },
      ],
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: { description: `The artwork, ${artwork}. Text in the picture is read by people who cannot see it, so say what it says below.` },
    },
    { name: 'alt', type: 'text', required: true, maxLength: TILE_ALT_MAX, label: 'What the picture says', admin: { description: 'Read aloud for the link, e.g. "Emerald Coast Theatre: tickets for the winter season".' } },
    {
      name: 'href',
      type: 'text',
      required: true,
      label: 'Where it goes',
      validate: (value: string | null | undefined) => (!value?.trim() ? 'Enter where the tile goes.' : validateSupportHref(value)),
      admin: { description: 'A page on this site (/weather) or a secure https:// address. Sponsor links are marked as sponsored and send no referrer.' },
    },
    ...extra,
    {
      type: 'row',
      fields: [
        { name: 'runFrom', type: 'date', label: 'First day', admin: { width: '35%', date: { pickerAppearance: 'dayOnly' }, description: 'Empty: already running.' } },
        { name: 'runUntil', type: 'date', label: 'Last day', admin: { width: '35%', date: { pickerAppearance: 'dayOnly' }, description: 'Empty: runs until switched off. The whole of this day counts.' } },
        { name: 'enabled', type: 'checkbox', defaultValue: true, label: 'Show', admin: { width: '30%', description: 'Switch off to hold a tile without deleting it.' } },
      ],
    },
  ]
}

export const Placements: GlobalConfig = {
  slug: 'placements',
  label: 'Sponsor and promo placements',
  admin: { group: 'Pages & hubs', livePreview: { url: '/' } },
  access: { read: () => true, update: canEditPlacements },
  hooks: {
    afterChange: [
      ({ doc, req: { context } }) => {
        if (!context.disableRevalidate) revalidatePath('/')
        return doc
      },
    ],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: RAIL.name,
          description: `Up to ${RAIL.max} tiles in a column beside the news on the home page, in this order (drag to reorder). ${RAIL.where} A tile that is switched off, outside its dates, or missing its picture or address is left out, and the rest close up: nothing leaves an empty box.`,
          fields: [
            {
              name: 'homeRail',
              type: 'array',
              label: 'Tiles',
              maxRows: RAIL.max,
              labels: { singular: 'Tile', plural: 'Tiles' },
              admin: { components: { RowLabel: '@/globals/PlacementRowLabel#TileRowLabel' } },
              fields: tileFields(artworkSize(RAIL.artwork)),
            },
          ],
        },
        {
          label: BAND.name,
          description: `One band between the news and the video row. ${BAND.where} It is one message, in a fixed place, not a rotation. No row means no banner.`,
          fields: [
            {
              name: 'homeBand',
              type: 'array',
              label: 'Banner',
              maxRows: BAND.max,
              labels: { singular: 'Banner', plural: 'Banner' },
              admin: { components: { RowLabel: '@/globals/PlacementRowLabel#TileRowLabel' } },
              fields: tileFields(artworkSize(BAND.artwork), [
                {
                  name: 'phoneImage',
                  type: 'upload',
                  relationTo: 'media',
                  label: 'Picture for phones',
                  admin: { description: `Optional, ${artworkSize(BAND.phoneArtwork ?? BAND.artwork)}. Without it, phones get the wide picture, scaled down.` },
                },
              ]),
            },
          ],
        },
      ],
    },
  ],
}
