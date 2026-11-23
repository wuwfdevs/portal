import { describe, expect, it } from 'vitest'

import { trackFromAudio } from '@/lib/player/track'

// `latest.ts` reads through Payload; what it decides is in `trackFromAudio`, which it uses for a members-only episode too: audio the public may not play comes back without an address.
describe('the latest episode\'s track', () => {
  it('is a track for a playable file, titled by the episode, linking to it', () => {
    expect(trackFromAudio({ id: 3, url: 'https://files.example/a.mp3', title: 'File', credit: null, durationSeconds: 90 }, { title: 'The council house', href: '/shows/uf/2026-01-01/council' })).toMatchObject({ id: 'audio-3', title: 'The council house', href: '/shows/uf/2026-01-01/council' })
  })
  it('is nothing for audio with no address (a members-only file, to the public) or a missing file', () => {
    expect(trackFromAudio({ id: 3, url: null, title: 'File', credit: null, durationSeconds: 90 }, { title: 'T' })).toBeNull()
    expect(trackFromAudio(null, { title: 'T' })).toBeNull()
  })
})
