import type { Block } from 'payload'

/**
 * A video file from the video library, with its own player. For video hosted by YouTube or Vimeo, use an Embed
 * instead: those are not stored here.
 */
export const VideoPlayer: Block = {
  slug: 'videoPlayer',
  interfaceName: 'VideoPlayerBlock',
  labels: { singular: 'Video', plural: 'Videos' },
  fields: [
    { name: 'video', type: 'upload', relationTo: 'video', required: true },
    {
      name: 'title',
      type: 'text',
      admin: { description: 'Names the video for people using a screen reader. Leave empty to use the video file\'s own title.' },
    },
    { name: 'caption', type: 'text', admin: { description: 'Shown under the video.' } },
    {
      name: 'poster',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'The picture shown before it plays. Leave empty to use the video file\'s own picture, if it has one.' },
    },
  ],
}
