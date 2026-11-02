import type { Block } from 'payload'

/** An audio file from the audio library, with its own player: a clip, a segment, an interview. */
export const AudioPlayer: Block = {
  slug: 'audioPlayer',
  interfaceName: 'AudioPlayerBlock',
  labels: { singular: 'Audio', plural: 'Audio' },
  fields: [
    { name: 'audio', type: 'upload', relationTo: 'audio', required: true },
    {
      name: 'title',
      type: 'text',
      admin: { description: 'Shown above the player. Leave empty to use the audio file\'s own title.' },
    },
    { name: 'description', type: 'textarea', admin: { description: 'Optional. Leave empty to use the audio file\'s own description.' } },
    { name: 'thumbnail', type: 'upload', relationTo: 'media', admin: { description: 'Optional picture shown beside the player.' } },
  ],
}
