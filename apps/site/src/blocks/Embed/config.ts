import type { Block } from 'payload'

import { EMBED_FAILURE_MESSAGE, resolveEmbed } from '../../lib/embeds'

/**
 * A video, audio player, other frame or a post on X or Facebook, by URL. Not free HTML: known providers are recognised and rewritten to
 * their canonical embed address; any other host must be on the approved list in Site settings. The URL is checked
 * on save (so an editor is told why at once) and again when rendered. Posts on X and Facebook are shown as a
 * static card that links to the original, never as a live embed (those load the platform's tracking script).
 */
export const Embed: Block = {
  slug: 'embed',
  interfaceName: 'EmbedBlock',
  labels: { singular: 'Embed', plural: 'Embeds' },
  fields: [
    {
      name: 'url',
      type: 'text',
      required: true,
      admin: { description: 'The address of a specific video, episode or track (YouTube, Vimeo, Spotify, Apple Podcasts, SoundCloud), or a page on an approved site.' },
      validate: async (value: string | null | undefined, { req }: { req: { payload: { findGlobal: (a: { slug: 'site-settings'; depth: number }) => Promise<{ embedHosts?: { host: string }[] | null }> } } }) => {
        if (!value) return 'Enter the embed address.'
        const settings = await req.payload.findGlobal({ slug: 'site-settings', depth: 0 })
        const result = resolveEmbed(value, (settings.embedHosts ?? []).map((h) => h.host))
        return result.ok ? true : EMBED_FAILURE_MESSAGE[result.reason]
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: { description: 'What the embed is, for people using a screen reader. Not shown on the page.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'width',
          type: 'number',
          min: 1,
          max: 4000,
          admin: { width: '50%', description: 'Optional. The original width of an embedded page or widget, to keep its proportions.' },
        },
        {
          name: 'height',
          type: 'number',
          min: 1,
          max: 4000,
          admin: { width: '50%', description: 'Optional. The original height. Used together with the width; videos and audio players ignore both.' },
        },
      ],
    },
    {
      name: 'caption',
      type: 'text',
      admin: { description: 'Shown under the embed. For a post on X or Facebook, put the post\'s text here: it is shown on the card.' },
    },
  ],
}
