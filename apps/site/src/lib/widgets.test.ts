import { describe, expect, it } from 'vitest'

import { WIDGET_SANDBOX, buildWidgetDocument, checkScriptUrl, clampHeight, parseSizeMessage, widgetProblems } from './widgets'

const electup = { scriptUrl: 'https://static.electup.com/v2/app.js', module: true, elementId: 'electup-embed', attributes: [{ name: 'data-embed', value: '36c12ca5-de84-4c35-979e-53f4f81c4d2e' }], initEvent: 'electup_load' }

describe('the script address', () => {
  it('accepts an https address on a public host and drops the fragment', () => {
    expect(checkScriptUrl('https://static.electup.com/v2/app.js#x')).toEqual({ ok: true, url: 'https://static.electup.com/v2/app.js', host: 'static.electup.com' })
  })
  it('refuses http, an address with a password, nonsense, a private host and this site', () => {
    expect(checkScriptUrl('http://static.electup.com/a.js')).toMatchObject({ ok: false, reason: 'not_https' })
    expect(checkScriptUrl('https://u:p@static.electup.com/a.js')).toMatchObject({ ok: false, reason: 'has_credentials' })
    expect(checkScriptUrl('not a url')).toMatchObject({ ok: false, reason: 'invalid_url' })
    expect(checkScriptUrl('')).toMatchObject({ ok: false, reason: 'invalid_url' })
    for (const u of ['https://localhost/a.js', 'https://10.0.0.2/a.js', 'https://intranet/a.js', 'https://169.254.169.254/a.js']) expect(checkScriptUrl(u), u).toMatchObject({ ok: false, reason: 'private_host' })
    expect(checkScriptUrl('https://www.wuwf.org/a.js')).toMatchObject({ ok: false, reason: 'own_site' })
  })
})

describe('what an editor may put in a widget', () => {
  it('a normal widget has no problems', () => {
    expect(widgetProblems(electup)).toEqual([])
  })
  it('only data- attributes, a plain id and a plain event name are allowed', () => {
    expect(widgetProblems({ ...electup, attributes: [{ name: 'onclick', value: 'x' }] })).toEqual(['"onclick" is not allowed: attribute names must start with data-.'])
    expect(widgetProblems({ ...electup, attributes: [{ name: 'src', value: 'x' }] })).toHaveLength(1)
    expect(widgetProblems({ ...electup, elementId: '"><script>' })).toHaveLength(1)
    expect(widgetProblems({ ...electup, initEvent: '");alert(1);("' })).toHaveLength(1)
  })
  it('a bad script address is a problem', () => {
    expect(widgetProblems({ ...electup, scriptUrl: 'http://x.example.org/a.js' })).toEqual(['The script address must use https.'])
  })
})

describe('the document the widget runs in', () => {
  const doc = buildWidgetDocument(electup)!
  it('has the container with its id and data attribute, the init event, and the module script, in that order', () => {
    expect(doc).toContain('<div id="electup-embed" data-embed="36c12ca5-de84-4c35-979e-53f4f81c4d2e"></div>')
    expect(doc).toContain('window.dispatchEvent(new Event("electup_load"))')
    expect(doc).toContain('<script type="module" src="https://static.electup.com/v2/app.js"></script>')
    expect(doc.indexOf('id="electup-embed"')).toBeLessThan(doc.indexOf('electup_load'))
    expect(doc.indexOf('electup_load')).toBeLessThan(doc.indexOf('static.electup.com'))
  })
  it('reports its own height so the page can size the frame', () => {
    expect(doc).toContain('parent.postMessage')
    expect(doc).toContain('"wuwf-widget"')
  })
  it('is not built at all when anything is unsafe', () => {
    expect(buildWidgetDocument({ ...electup, scriptUrl: 'javascript:alert(1)' })).toBeNull()
    expect(buildWidgetDocument({ ...electup, attributes: [{ name: 'onload', value: 'x' }] })).toBeNull()
  })
  it('escapes every value, so a value cannot close its attribute or the page', () => {
    const d = buildWidgetDocument({ ...electup, attributes: [{ name: 'data-x', value: '"><script>alert(1)</script>' }] })!
    expect(d).not.toContain('<script>alert(1)</script>')
    expect(d).toContain('data-x="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"')
  })
  it('a plain script is not a module, and a widget needs no container id or init event', () => {
    const d = buildWidgetDocument({ scriptUrl: 'https://widgets.example.org/w.js' })!
    expect(d).toContain('<div></div>')
    expect(d).toContain('<script src="https://widgets.example.org/w.js"></script>')
    expect(d).not.toContain('dispatchEvent')
  })
})

describe('the sandbox', () => {
  it('never lets the widget share this site\'s origin, navigate the page, or read its cookies', () => {
    expect(WIDGET_SANDBOX).not.toContain('allow-same-origin')
    expect(WIDGET_SANDBOX).not.toContain('allow-top-navigation')
    expect(WIDGET_SANDBOX).toContain('allow-scripts')
  })
})

describe('the height a frame reports', () => {
  it('is clamped to a sensible range', () => {
    expect(clampHeight(5)).toBe(100)
    expect(clampHeight(450.4)).toBe(450)
    expect(clampHeight(999_999)).toBe(3000)
  })
  it('only a message in our own shape counts', () => {
    expect(parseSizeMessage({ source: 'wuwf-widget', height: 800 })).toBe(800)
    for (const m of [null, 'x', 7, {}, { source: 'other', height: 800 }, { source: 'wuwf-widget', height: '800' }, { source: 'wuwf-widget', height: Number.NaN }]) expect(parseSizeMessage(m)).toBeNull()
  })
})
