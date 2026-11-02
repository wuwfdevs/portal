import { describe, expect, it } from 'vitest'

import { EMBED_FAILURE_MESSAGE, embedAllow, resolveEmbed } from './embeds'

const src = (u: string, hosts: string[] = []) => {
  const r = resolveEmbed(u, hosts)
  return r.ok ? r.embed.src : r.reason
}

describe('known providers are rewritten to their canonical embed address', () => {
  it('YouTube: every common link shape, with a start time, via the privacy host', () => {
    const id = 'dQw4w9WgXcQ'
    for (const u of [`https://www.youtube.com/watch?v=${id}`, `https://youtu.be/${id}`, `https://youtube.com/shorts/${id}`, `https://m.youtube.com/embed/${id}`, `https://www.youtube.com/live/${id}`])
      expect(src(u), u).toBe(`https://www.youtube-nocookie.com/embed/${id}`)
    expect(src(`https://youtu.be/${id}?t=90`)).toBe(`https://www.youtube-nocookie.com/embed/${id}?start=90`)
    expect(src(`https://youtu.be/${id}?t=1m30s`)).toBe(`https://www.youtube-nocookie.com/embed/${id}?start=90`)
  })
  it('Vimeo, including an unlisted video\'s hash', () => {
    expect(src('https://vimeo.com/123456789')).toBe('https://player.vimeo.com/video/123456789')
    expect(src('https://vimeo.com/123456789/abcdef1234')).toBe('https://player.vimeo.com/video/123456789?h=abcdef1234')
    expect(src('https://player.vimeo.com/video/123456789?h=abcdef1234&autoplay=1')).toBe('https://player.vimeo.com/video/123456789?h=abcdef1234')
  })
  it('Spotify, Apple Podcasts and SoundCloud, as audio players', () => {
    const sp = '4rOoJ6Egrf8K2IrywzwOMk'
    expect(src(`https://open.spotify.com/episode/${sp}?si=abc`)).toBe(`https://open.spotify.com/embed/episode/${sp}`)
    expect(src('https://podcasts.apple.com/us/podcast/high-ground/id1234567890?i=1000123456789')).toBe('https://embed.podcasts.apple.com/us/podcast/high-ground/id1234567890?i=1000123456789')
    expect(src('https://soundcloud.com/wuwf/a-session')).toBe(`https://w.soundcloud.com/player/?url=${encodeURIComponent('https://soundcloud.com/wuwf/a-session')}`)
    const r = resolveEmbed(`https://open.spotify.com/episode/${sp}`)
    expect(r.ok && r.embed.shape).toBe('audio')
  })
  it('never uses the pasted URL as-is, so extra parameters (autoplay, tracking) are dropped', () => {
    expect(src('https://www.youtube.com/watch?v=dQw4w9WgXcQ&autoplay=1&list=x&utm_source=y')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  })
})

describe('refusals', () => {
  it('only https, no credentials, and only valid URLs', () => {
    expect(src('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('not_https')
    expect(src('javascript:alert(1)')).toBe('not_https')
    expect(src('data:text/html,<script>1</script>')).toBe('not_https')
    expect(src('https://user:pw@www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('has_credentials')
    expect(src('not a url')).toBe('invalid_url')
    expect(src('')).toBe('invalid_url')
  })
  it('look-alike hosts and path tricks are not the provider', () => {
    for (const u of ['https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ', 'https://evilyoutube.com/watch?v=dQw4w9WgXcQ', 'https://evil.example/https://youtube.com/watch?v=dQw4w9WgXcQ', 'https://vimeo.com.evil.example/123456789'])
      expect(src(u), u).toBe('host_not_allowed')
  })
  it('a provider page that is not a playable item is named as such', () => {
    expect(src('https://www.youtube.com/@wuwf')).toBe('unsupported_link')
    expect(src('https://vimeo.com/wuwf')).toBe('unsupported_link')
    expect(src('https://open.spotify.com/user/abc')).toBe('unsupported_link')
    expect(src('https://www.youtube.com/watch?v=short')).toBe('unsupported_link')
  })
  it('every refusal has a message an editor can act on', () => {
    for (const msg of Object.values(EMBED_FAILURE_MESSAGE)) expect(msg.length).toBeGreaterThan(10)
  })
})

describe('other hosts need an administrator\'s approval', () => {
  it('are refused until approved, then matched exactly over https', () => {
    expect(src('https://maps.example.org/embed/1')).toBe('host_not_allowed')
    expect(src('https://maps.example.org/embed/1', ['maps.example.org'])).toBe('https://maps.example.org/embed/1')
    expect(src('https://maps.example.org/embed/1', ['  MAPS.example.org '])).toBe('https://maps.example.org/embed/1')
  })
  it('a subdomain or a parent is not the approved host', () => {
    expect(src('https://evil.maps.example.org/x', ['maps.example.org'])).toBe('host_not_allowed')
    expect(src('https://example.org/x', ['maps.example.org'])).toBe('host_not_allowed')
  })
  it('http is still refused for an approved host, and the fragment is dropped', () => {
    expect(src('http://maps.example.org/x', ['maps.example.org'])).toBe('not_https')
    expect(src('https://maps.example.org/x#top', ['maps.example.org'])).toBe('https://maps.example.org/x')
  })
})

describe('embedAllow', () => {
  it('audio players never get fullscreen', () => {
    expect(embedAllow('audio')).not.toContain('fullscreen')
    expect(embedAllow('video')).toContain('fullscreen')
  })
})
