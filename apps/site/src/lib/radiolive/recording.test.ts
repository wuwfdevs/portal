import { describe, expect, it } from 'vitest'

import { recordingEmbed, validateRecordingUrl } from './recording'

describe('recordingEmbed', () => {
  it('accepts one video on YouTube or Vimeo', () => {
    for (const url of ['https://youtu.be/hVgWH8kF_RQ?is=RgEYez30ZQZrbOhy', 'https://www.youtube.com/watch?v=hVgWH8kF_RQ', 'https://vimeo.com/123456789']) {
      const r = recordingEmbed(url)
      expect(r.ok, url).toBe(true)
    }
  })
  it('refuses a playlist, another site, a non-https address and nothing', () => {
    for (const url of ['https://www.youtube.com/playlist?list=PL7wabVdOsi0NL7ozG7c702xTmikRYGwEJ', 'https://example.com/video', 'http://youtu.be/hVgWH8kF_RQ', 'https://open.spotify.com/track/abc', '', '  ', 'not a url']) {
      const r = recordingEmbed(url)
      expect(r.ok, url).toBe(false)
    }
  })
})

describe('validateRecordingUrl', () => {
  it('allows empty and gives an editor a message otherwise', () => {
    expect(validateRecordingUrl(null)).toBe(true)
    expect(validateRecordingUrl('')).toBe(true)
    expect(validateRecordingUrl('https://youtu.be/hVgWH8kF_RQ')).toBe(true)
    expect(typeof validateRecordingUrl('https://example.com/x')).toBe('string')
  })
})
