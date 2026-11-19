import type { GlobalConfig } from 'payload'

import { fieldRequires, requirePermission } from '@/access/permissions'
import { TUNING_LIMITS } from '@/lib/embeddings/tuning'
import { portalOriginProblem } from '@/lib/listening/config'
import { storyEmbeddingEndpoints } from './storyEmbeddingEndpoints'
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
  endpoints: storyEmbeddingEndpoints,
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
      name: 'semanticSearch',
      type: 'checkbox',
      defaultValue: false,
      label: 'Find stories by meaning in search',
      admin: {
        description:
          'When on, the words a visitor types into search are sent to OpenAI so search can also find stories about the same topic in different words. When off, search uses only the exact words and nothing a visitor types leaves this site. Turn it on only after the site\'s privacy notice says so (the wording to paste is `PRIVACY_PAGE_PARAGRAPHS` in `src/lib/embeddings/notice.ts`). It also needs the OpenAI key set on the server and the stories embedded; without them this setting does nothing. (It does not control which stories are embedded: that is the key and the embedding run.)',
      },
    },
    {
      type: 'collapsible',
      label: 'Related stories and search by meaning',
      admin: {
        initCollapsed: false,
        description:
          'How stories are embedded (so each can be compared with the others), and how close two stories must be to be offered together. Saving this page applies the numbers to every story page and to search straight away.',
      },
      fields: [
        {
          name: 'relatedMinSimilarity',
          type: 'number',
          label: 'How closely related a story must be to appear under another story',
          defaultValue: TUNING_LIMITS.relatedMinSimilarity.fallback,
          min: TUNING_LIMITS.relatedMinSimilarity.min,
          max: TUNING_LIMITS.relatedMinSimilarity.max,
          admin: {
            step: 0.05,
            description:
              'A number from 0.1 to 0.9. Higher shows only stories that are very close in subject, so fewer stories get a "Related stories" section; lower shows looser matches, and a story with nothing close may still get four. 0.35 is a starting value, not a measurement: use the examples below to set it by eye.',
          },
        },
        {
          name: 'searchMinSimilarity',
          type: 'number',
          label: 'How closely a story must match the words searched, to appear as a search result by meaning',
          defaultValue: TUNING_LIMITS.searchMinSimilarity.fallback,
          min: TUNING_LIMITS.searchMinSimilarity.min,
          max: TUNING_LIMITS.searchMinSimilarity.max,
          admin: {
            step: 0.05,
            description:
              'A number from 0.05 to 0.9. Search words are short and a story is long, so this runs lower than the number above (0.2 is the starting value). Higher gives fewer, more certain extra results. It only matters while "Find stories by meaning in search" is on.',
          },
        },
        {
          name: 'relatedMaxPerSeries',
          type: 'number',
          label: 'Most related stories from one show or series',
          defaultValue: TUNING_LIMITS.relatedMaxPerSeries.fallback,
          min: TUNING_LIMITS.relatedMaxPerSeries.min,
          max: TUNING_LIMITS.relatedMaxPerSeries.max,
          validate: (value: number | null | undefined) => (value == null || Number.isInteger(value) ? true : 'Enter a whole number.'),
          admin: {
            step: 1,
            description: 'From 1 to 4 (of the four shown). A run of instalments of one series is not variety, so this keeps one show from filling the list.',
          },
        },
        {
          name: 'storyEmbeddingsPanel',
          type: 'ui',
          admin: { components: { Field: '@/components/admin/StoryEmbeddingsPanel#StoryEmbeddingsPanel' } },
        },
      ],
    },
    {
      name: 'portalOrigin',
      type: 'text',
      label: 'Portal address',
      // This document is publicly readable. The Portal's address is not for the public, so only staff who manage settings can read or change it;
      // the server reads it with its own access.
      access: { read: fieldRequires('settings.manage'), update: fieldRequires('settings.manage') },
      admin: {
        description:
          'Where the Portal is, for the listening pages (table sessions, the after-page, the organizer room, kitchen tables). The address only, with https and no path, for example https://tools.example.org. Leave it empty to use the server\'s PORTAL_ORIGIN setting. The signing secret is never kept here: it stays a server setting.',
      },
      validate: (value: string | null | undefined) => portalOriginProblem(value) ?? true,
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
