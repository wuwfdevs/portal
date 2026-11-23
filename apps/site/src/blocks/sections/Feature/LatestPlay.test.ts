import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LatestPlay } from './LatestPlay'

let track: unknown = { id: 'audio-1', src: 'https://files.example/ep.mp3', title: 'The council house', credit: null, durationSeconds: 600, href: '/shows/uf/2026-01-01/council' }
let fail = false
const loadLatestTrack = vi.fn(async () => {
  if (fail) throw new Error('down')
  return track
})
vi.mock('@/lib/shows/latest', () => ({ loadLatestTrack: (...a: unknown[]) => (loadLatestTrack as unknown as (...x: unknown[]) => unknown)(...a) }))

beforeEach(() => {
  fail = false
  loadLatestTrack.mockClear()
  track = { id: 'audio-1', src: 'https://files.example/ep.mp3', title: 'The council house', credit: null, durationSeconds: 600, href: '/shows/uf/2026-01-01/council' }
})

describe('LatestPlay', () => {
  it('reads the show\'s newest playable episode and draws the site\'s play button with the block\'s words and the episode\'s track', async () => {
    const out = (await LatestPlay({ showId: 7, label: 'Play the latest' })) as { props: { label: string; track: { id: string; title: string }; toned: boolean } } | null
    expect(loadLatestTrack).toHaveBeenCalledWith(7)
    expect(out?.props.label).toBe('Play the latest')
    expect(out?.props.track.title).toBe('The council house')
    expect(out?.props.toned).toBe(true)
  })
  it('draws nothing when the show has no playable episode, and when the read fails', async () => {
    track = null
    expect(await LatestPlay({ showId: 7, label: 'x' })).toBeNull()
    fail = true
    expect(await LatestPlay({ showId: 7, label: 'x' })).toBeNull()
  })
})
