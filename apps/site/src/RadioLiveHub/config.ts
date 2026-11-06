import type { GlobalConfig } from 'payload'

import { requirePermission } from '@/access/permissions'
import { validateEmail, validatePhone } from '@/lib/radiolive/contact'
import { validateSupportHref } from '@/lib/support-link'

import { revalidateRadioLiveHub } from './hooks/revalidate'

/**
 * The RadioLive page (`/radiolive`, board 12). The shows and artists are their own records; this holds what is the page's own: which
 * production RadioLive is (its funders come from that), the picture at the top, the host, the Encores broadcast and the call to support.
 * Not here, because nothing stands behind them: the lineup email, "tell me when tickets go on sale", and the giving levels (a gift is made
 * on the donation form and counted there; this page only points to it).
 */
export const RadioLiveHub: GlobalConfig = {
  slug: 'radiolive-hub',
  label: 'RadioLive page',
  admin: { group: 'Pages & hubs', livePreview: { url: '/radiolive' } },
  access: { read: () => true, update: requirePermission('content.publish') },
  hooks: { afterChange: [revalidateRadioLiveHub] },
  fields: [
    { name: 'production', type: 'relationship', relationTo: 'productions', admin: { description: 'The RadioLive production. Its funder lines ("RadioLive is made possible by...") come from its underwriting agreements.' } },
    { name: 'tagline', type: 'text', defaultValue: 'Songwriters live from downtown Pensacola, on the air on 88.1 FM' },
    { name: 'heroPhoto', type: 'upload', relationTo: 'media', admin: { description: 'The wide picture at the top. Give it alt text in the media library.' } },
    {
      name: 'host',
      type: 'group',
      fields: [
        { name: 'kicker', type: 'text', defaultValue: 'On the air since 1988' },
        { name: 'heading', type: 'text', defaultValue: 'Hosted by Tanya Gallagher, with William Howell & The Coveralls' },
        { name: 'text', type: 'textarea', defaultValue: 'A songwriters\' show in front of a live audience in downtown Pensacola, broadcast on WUWF 88.1.' },
        { name: 'portrait', type: 'upload', relationTo: 'media' },
        { name: 'href', type: 'text', label: 'Link', validate: validateSupportHref, admin: { description: 'Where "The story of RadioLive" goes. Empty hides it.' } },
      ],
    },
    {
      name: 'encores',
      type: 'group',
      fields: [
        { name: 'heading', type: 'text', defaultValue: 'The best past sets, Thursdays 7–8 p.m.' },
        { name: 'text', type: 'textarea', defaultValue: 'Except the first Thursday of the month, when RadioLive is live.' },
        { name: 'linkLabel', type: 'text', defaultValue: 'Open the audio archive' },
        { name: 'href', type: 'text', label: 'Link', validate: validateSupportHref, defaultValue: '/podcasts', admin: { description: 'Where the audio archive is. Empty hides the button.' } },
      ],
    },
    {
      name: 'support',
      type: 'group',
      fields: [
        { name: 'heading', type: 'text', defaultValue: 'Keep the music live.' },
        { name: 'text', type: 'textarea', defaultValue: 'Direct your WUWF membership to RadioLive. It pays the artists, keeps the equipment current and keeps every show free on the air.' },
        { name: 'buttonLabel', type: 'text', defaultValue: 'Give to RadioLive' },
        { name: 'href', type: 'text', label: 'Link', validate: validateSupportHref, defaultValue: '/support', admin: { description: 'The donation page. Empty hides the button.' } },
        { name: 'note', type: 'text', defaultValue: 'On the donation form, choose "Count my gift as support for RadioLive."', admin: { description: 'Say only what the donation form really offers.' } },
      ],
    },
    {
      name: 'visit',
      type: 'group',
      label: 'Plan your visit',
      fields: [
        { name: 'heading', type: 'text', defaultValue: 'Plan your visit' },
        {
          name: 'items',
          type: 'array',
          maxRows: 12,
          labels: { singular: 'Fact', plural: 'Facts' },
          admin: { description: 'Short facts for people coming to a show: when it starts, soundcheck, seating, tickets, the venue address. Leave empty to hide the panel.' },
          fields: [
            { name: 'label', type: 'text', required: true, admin: { description: 'e.g. "Show", "Soundcheck", "Seating", "Tickets", "Where".' } },
            { name: 'text', type: 'textarea', required: true },
          ],
        },
      ],
    },
    {
      name: 'membership',
      type: 'group',
      label: 'Membership level (e.g. RadioLive 25)',
      admin: { description: 'A membership level sold for RadioLive. Leave the heading empty to hide it. A gift is still made on the donation form; this only describes the level and who to contact.' },
      fields: [
        { name: 'heading', type: 'text', admin: { description: 'The level\'s name, e.g. "RadioLive 25".' } },
        { name: 'text', type: 'textarea', admin: { description: 'The price and what members receive, exactly as the station sells it.' } },
        { name: 'contactName', type: 'text', admin: { description: 'Who to contact. Prefer a role (e.g. "the membership office") if the station has one.' } },
        { name: 'contactEmail', type: 'text', validate: validateEmail },
        { name: 'contactPhone', type: 'text', validate: validatePhone },
        { name: 'href', type: 'text', label: 'Link', validate: validateSupportHref, admin: { description: 'An optional page to join or learn more.' } },
      ],
    },
  ],
}
