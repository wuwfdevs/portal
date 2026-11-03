import { BlocksFeature, FixedToolbarFeature, HeadingFeature, HorizontalRuleFeature, InlineToolbarFeature, lexicalEditor } from '@payloadcms/richtext-lexical'

import { bodyBlocks } from '../blocks/body'

/**
 * The editor for anything that reads like a story: a story's body, a live blog's introduction, one live update. One
 * definition, so every place that takes story content takes the same blocks and renders them the same way.
 */
export const bodyEditor = lexicalEditor({
  features: ({ rootFeatures }) => [
    ...rootFeatures,
    HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
    BlocksFeature({ blocks: bodyBlocks }),
    FixedToolbarFeature(),
    InlineToolbarFeature(),
    HorizontalRuleFeature(),
  ],
})
