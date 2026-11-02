import type { Block } from 'payload'

import { EMBED_FAILURE_MESSAGE, resolveEmbed } from '../../lib/embeds'

/**
 * A video, audio player or other frame, by URL. Not free HTML: known providers are recognised and rewritten to
 * their canonical embed address; any other host must be on the approved list in Site settings. The URL is checked
 * on save (so an editor is told why at once) and again when rendered.
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
    { name: 'caption', type: 'text' },
  ],
}
