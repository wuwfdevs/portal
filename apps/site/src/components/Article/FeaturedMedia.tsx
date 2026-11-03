import React from 'react'

import type { LivePost, Post } from '@/payload-types'

import { EmbedBlock } from '@/blocks/Embed/Component'
import { GalleryBlock } from '@/blocks/Gallery/Component'
import { MediaBlock } from '@/blocks/MediaBlock/Component'
import { VideoPlayerBlock } from '@/blocks/VideoPlayer/Component'

/** The one picture, gallery or video that opens a story. Renders nothing when the story has none. */
export function FeaturedMedia({ blocks }: { blocks: Post['featuredMedia'] | LivePost['featuredMedia'] }) {
  const block = blocks?.[0]
  if (!block) return null
  switch (block.blockType) {
    case 'mediaBlock':
      return <MediaBlock {...block} captionClassName="mt-3" disableInnerContainer enableGutter={false} imgClassName="m-0" />
    case 'gallery':
      return <GalleryBlock {...block} className="my-0" />
    case 'videoPlayer':
      return <VideoPlayerBlock {...block} className="my-0" />
    case 'embed':
      return <EmbedBlock {...block} className="my-0" />
    default:
      return null
  }
}
