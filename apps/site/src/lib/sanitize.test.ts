import { describe, expect, it } from 'vitest'

import { sanitizeLegacyHtml } from './sanitize'

const clean = sanitizeLegacyHtml

describe('sanitizeLegacyHtml removes everything that can run', () => {
  it('scripts and their contents, styles, and plug-ins', () => {
    const out = clean('<p>Hi</p><script>alert(1)</script><style>body{display:none}</style><object data="x"></object><embed src="x">')
    expect(out).toBe('<p>Hi</p>')
  })
  it('frames, forms and inputs (a legacy page cannot smuggle an embed past the embed allowlist)', () => {
    const out = clean('<iframe src="https://evil.example"></iframe><form action="https://evil.example"><input name="x"><button>Go</button></form><p>ok</p>')
    expect(out).not.toMatch(/iframe|form|input|button|evil/)
    expect(out).toContain('<p>ok</p>')
  })
  it('event handlers and inline styles', () => {
    const out = clean('<p onclick="x()" style="position:fixed" class="a" id="b">t</p><img src="https://a.example/i.png" onerror="x()" alt="a">')
    expect(out).toBe('<p>t</p><img src="https://a.example/i.png" alt="a" />')
  })
  it('javascript:, data: and vbscript: links, and non-https images', () => {
    expect(clean('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript')
    expect(clean('<a href="data:text/html,<script>1</script>">x</a>')).not.toContain('data:')
    expect(clean('<a href=" jAvAsCrIpT:alert(1)">x</a>')).not.toContain('script')
    expect(clean('<img src="http://a.example/i.png">')).not.toContain('http:')
    expect(clean('<img src="//a.example/i.png">')).not.toContain('a.example')
    expect(clean('<img src="data:image/svg+xml;base64,PHN2Zz4=">')).not.toContain('data:')
  })
  it('svg and math (script-capable namespaces)', () => {
    const out = clean('<svg onload="x()"><script>1</script></svg><math><mi>x</mi></math><p>a</p>')
    expect(out).not.toMatch(/svg|math|script|onload/)
    expect(out).toContain('<p>a</p>')
  })
})

describe('sanitizeLegacyHtml keeps what a story needs', () => {
  it('paragraphs, headings, emphasis, lists, quotes and tables', () => {
    const html = '<h2>Head</h2><p>One <strong>two</strong> <em>three</em></p><ul><li>a</li></ul><blockquote>q</blockquote><table><thead><tr><th scope="col">h</th></tr></thead><tbody><tr><td colspan="2">c</td></tr></tbody></table>'
    expect(clean(html)).toBe(html)
  })
  it('https images with alt text', () => {
    expect(clean('<figure><img src="https://a.example/i.png" alt="A house" width="600"><figcaption>cap</figcaption></figure>')).toContain('src="https://a.example/i.png"')
  })
  it('links, always opened with a safe rel and never with a target', () => {
    const out = clean('<a href="https://wuwf.org/x" target="_blank" rel="opener">x</a>')
    expect(out).toBe('<a href="https://wuwf.org/x" rel="noopener noreferrer nofollow">x</a>')
    expect(clean('<a href="mailto:news@wuwf.org">m</a>')).toContain('mailto:news@wuwf.org')
  })
  it('is stable: sanitizing twice changes nothing', () => {
    const once = clean('<p>a <a href="https://x.example">b</a></p><script>1</script>')
    expect(clean(once)).toBe(once)
  })
  it('returns an empty string for nothing, and for input that is not a string', () => {
    for (const v of ['', '   ', null, undefined, 42, {}]) expect(clean(v)).toBe('')
  })
})
