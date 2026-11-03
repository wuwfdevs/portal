import { describe, expect, it } from 'vitest'

import { DEFAULT_EMBED_HOSTS, EMBED_FAILURE_MESSAGE, embedAllow, isPublicHost, resolveEmbed } from './embeds'

const src = (u: string, hosts: string[] = []) => {
  const r = resolveEmbed(u, hosts)
  return r.ok ? r.embed.src : r.reason
}
const how = (u: string, hosts: string[] = []) => {
  const r = resolveEmbed(u, hosts)
  return r.ok ? `${r.embed.provider}/${r.embed.load}` : r.reason
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
  it('look-alike hosts and path tricks are never the provider: they get no special trust and wait for a click', () => {
    for (const u of ['https://youtube.com.evil-site.org/watch?v=dQw4w9WgXcQ', 'https://evilyoutube.com/watch?v=dQw4w9WgXcQ', 'https://evil-site.org/https://youtube.com/watch?v=dQw4w9WgXcQ', 'https://vimeo.com.evil-site.org/123456789']) {
      expect(how(u), u).toBe('custom/click')
      expect(src(u), u).toBe(u) // used as given, never rewritten to the provider's embed address
    }
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

describe('other sites: some load at once, the rest wait for a click, a few are never embedded', () => {
  it('the built-in list loads without a click', () => {
    for (const host of DEFAULT_EMBED_HOSTS) expect(how(`https://${host}/x`), host).toBe('custom/auto')
  })
  it('any other public https site embeds, but only after the reader clicks', () => {
    expect(how('https://maps.example.org/embed/1')).toBe('custom/click')
    expect(src('https://maps.example.org/embed/1')).toBe('https://maps.example.org/embed/1')
  })
  it('an administrator can approve a site so it loads at once; the match is exact', () => {
    expect(how('https://maps.example.org/embed/1', ['maps.example.org'])).toBe('custom/auto')
    expect(how('https://maps.example.org/embed/1', ['  MAPS.example.org '])).toBe('custom/auto')
    expect(how('https://evil.maps.example.org/x', ['maps.example.org'])).toBe('custom/click')
    expect(how('https://example.org/x', ['maps.example.org'])).toBe('custom/click')
  })
  it('http is refused, and the fragment is dropped', () => {
    expect(src('http://maps.example.org/x')).toBe('not_https')
    expect(src('https://maps.example.org/x#top')).toBe('https://maps.example.org/x')
  })
  it('a private or internal address is never embedded, so a story cannot probe the network behind the site', () => {
    for (const u of ['https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.5/admin', 'https://192.168.1.1/', 'https://[::1]/x', 'https://intranet/x', 'https://printer.local/x', 'https://db.internal/x', 'https://169.254.169.254/latest/meta-data'])
      expect(src(u), u).toBe('private_host')
  })
  it('a page of this site is never embedded', () => {
    expect(src('https://www.wuwf.org/local-news/2020-01-02/a-story')).toBe('own_site')
    expect(src('https://wuwf.org/support')).toBe('own_site')
  })
  it('knows what a public host is', () => {
    expect(isPublicHost('embed.documentcloud.org')).toBe(true)
    for (const h of ['localhost', '10.0.0.1', 'host', 'a.local', '[::1]', '']) expect(isPublicHost(h), h).toBe(false)
  })
})

describe('embedAllow', () => {
  it('audio players never get fullscreen', () => {
    expect(embedAllow('audio')).not.toContain('fullscreen')
    expect(embedAllow('video')).toContain('fullscreen')
  })
})

describe('posts on X and Facebook are link-only: a canonical address, never a frame', () => {
  const kind = (u: string) => {
    const r = resolveEmbed(u)
    return r.ok ? { provider: r.embed.provider, shape: r.embed.shape, src: r.embed.src } : r.reason
  }
  it('an X post is rebuilt on x.com whichever host or tracking query it came with', () => {
    const want = { provider: 'x', shape: 'link', src: 'https://x.com/NPR/status/1234567890123' }
    for (const u of [
      'https://twitter.com/NPR/status/1234567890123',
      'https://www.twitter.com/NPR/status/1234567890123?s=20&t=abc',
      'https://mobile.twitter.com/NPR/status/1234567890123/',
      'https://x.com/NPR/status/1234567890123',
    ])
      expect(kind(u), u).toEqual(want)
  })
  it('an X profile or search page is not a post', () => {
    expect(kind('https://x.com/NPR')).toBe('unsupported_link')
    expect(kind('https://twitter.com/search?q=wuwf')).toBe('unsupported_link')
  })
  it('a Facebook post, video, permalink, watch and share link are accepted and rebuilt', () => {
    expect(kind('https://www.facebook.com/WUWF/posts/1234567890123?ref=x')).toEqual({ provider: 'facebook', shape: 'link', src: 'https://www.facebook.com/WUWF/posts/1234567890123' })
    expect(kind('https://m.facebook.com/WUWF/videos/987654321012')).toMatchObject({ provider: 'facebook', src: 'https://www.facebook.com/WUWF/videos/987654321012' })
    expect(kind('https://www.facebook.com/permalink.php?story_fbid=1234567&id=7654321&utm=z')).toMatchObject({ src: 'https://www.facebook.com/permalink.php?story_fbid=1234567&id=7654321' })
    expect(kind('https://www.facebook.com/watch/?v=1234567890')).toMatchObject({ src: 'https://www.facebook.com/watch/?v=1234567890' })
    expect(kind('https://fb.watch/abc-DEF_1/')).toMatchObject({ provider: 'facebook', src: 'https://fb.watch/abc-DEF_1/' })
  })
  it('the Facebook home page, a login page or a bare page name is not a post', () => {
    expect(kind('https://www.facebook.com/')).toBe('unsupported_link')
    expect(kind('https://www.facebook.com/WUWF')).toBe('unsupported_link')
    expect(kind('https://www.facebook.com/permalink.php?story_fbid=abc&id=1')).toBe('unsupported_link')
  })
  it('a look-alike host is not treated as X or Facebook', () => {
    // not the platform, so no link-only card and no trust: an ordinary site, behind a click
    expect(kind('https://x.com.evil-site.org/NPR/status/1234567890123')).toMatchObject({ provider: 'custom' })
    expect(kind('https://facebook.com.evil-site.org/WUWF/posts/1234567890123')).toMatchObject({ provider: 'custom' })
  })
  it('credentials and plain http are still refused first', () => {
    expect(kind('http://x.com/NPR/status/1234567890123')).toBe('not_https')
    expect(kind('https://user:pw@x.com/NPR/status/1234567890123')).toBe('has_credentials')
  })
})
