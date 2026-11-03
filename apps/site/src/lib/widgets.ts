// A widget is an embed that works by running a script (an election guide, a chart, a map): a container element plus
// a script from another site. Grove let that script run in the page itself. Here it never does. The script runs
// inside a frame we build, in a sandbox that gives it no access to this site's cookies, storage or page (no
// `allow-same-origin`, so the frame has its own empty origin), and only after the reader clicks to load it.
//
// The pieces are structured fields, never free HTML: one https script address on a public host, an optional
// container id, `data-*` attributes, and the name of one event to dispatch before the script loads (some widgets
// need it). Everything is checked here and escaped when the frame's document is built. Pure.

import { DEFAULT_EMBED_HOSTS, isPublicHost } from './embeds'

/** No `allow-same-origin`: the widget cannot touch this site. Popups may leave the sandbox so a link opens normally. */
export const WIDGET_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms'

export const WIDGET_MESSAGE_SOURCE = 'wuwf-widget'
export const MIN_WIDGET_HEIGHT = 100
export const MAX_WIDGET_HEIGHT = 3000
export const DEFAULT_WIDGET_HEIGHT = 600

export interface WidgetSpec {
  scriptUrl: string
  /** Load the script as a module (`<script type="module">`). */
  module?: boolean | null
  elementId?: string | null
  attributes?: readonly { name?: string | null; value?: string | null }[] | null
  /** An event to dispatch on `window` before the script loads, if the widget expects one. */
  initEvent?: string | null
}

export type ScriptUrlResult = { ok: true; url: string; host: string } | { ok: false; reason: 'invalid_url' | 'not_https' | 'has_credentials' | 'private_host' | 'own_site' }

const OWN_HOSTS = new Set(['wuwf.org', 'www.wuwf.org'])

export function checkScriptUrl(input: string | null | undefined): ScriptUrlResult {
  let u: URL
  try {
    u = new URL((input ?? '').trim())
  } catch {
    return { ok: false, reason: 'invalid_url' }
  }
  if (u.protocol !== 'https:') return { ok: false, reason: 'not_https' }
  if (u.username || u.password) return { ok: false, reason: 'has_credentials' }
  const host = u.hostname.toLowerCase()
  if (OWN_HOSTS.has(host)) return { ok: false, reason: 'own_site' }
  if (!isPublicHost(host)) return { ok: false, reason: 'private_host' }
  u.hash = ''
  return { ok: true, url: u.toString(), host }
}

/**
 * Whether a widget loads by itself or waits for a click. The same rule as an embed: a script from a built-in or
 * administrator-approved host loads on its own (inside the sandbox, so it still cannot touch this site); any other
 * public host waits for the reader. Called with the widget's script address; anything unusable is a click.
 */
export function widgetLoad(scriptUrl: string | null | undefined, approvedHosts: readonly string[] = []): 'auto' | 'click' {
  const r = checkScriptUrl(scriptUrl)
  if (!r.ok) return 'click'
  return DEFAULT_EMBED_HOSTS.includes(r.host) || approvedHosts.map((h) => h.trim().toLowerCase()).includes(r.host) ? 'auto' : 'click'
}

export const SCRIPT_URL_MESSAGE: Record<Exclude<ScriptUrlResult, { ok: true }>['reason'], string> = {
  invalid_url: 'That is not a valid address.',
  not_https: 'The script address must use https.',
  has_credentials: 'The address must not contain a username or password.',
  private_host: 'That address is not on the public internet.',
  own_site: 'A script from this site cannot be used as a widget.',
}

export const isDataAttribute = (name: string): boolean => /^data-[a-z0-9][a-z0-9_.-]{0,60}$/.test(name)
export const isElementId = (id: string): boolean => /^[A-Za-z][\w:.-]{0,80}$/.test(id)
export const isEventName = (name: string): boolean => /^[A-Za-z][\w:.-]{0,60}$/.test(name)

export const clampHeight = (n: number): number => Math.min(MAX_WIDGET_HEIGHT, Math.max(MIN_WIDGET_HEIGHT, Math.round(n)))

/** What is wrong with a widget, in words an editor can act on. Empty when it is fine. */
export function widgetProblems(spec: WidgetSpec): string[] {
  const problems: string[] = []
  const s = checkScriptUrl(spec.scriptUrl)
  if (!s.ok) problems.push(SCRIPT_URL_MESSAGE[s.reason])
  if (spec.elementId && !isElementId(spec.elementId)) problems.push('The container id may use letters, digits, - _ : and . and must start with a letter.')
  for (const a of spec.attributes ?? []) {
    if (!a.name || !isDataAttribute(a.name)) problems.push(`"${a.name ?? ''}" is not allowed: attribute names must start with data-.`)
  }
  if (spec.initEvent && !isEventName(spec.initEvent)) problems.push('The event name may use letters, digits, - _ : and . and must start with a letter.')
  return problems
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/**
 * Keeps the host page sized to the widget: the sandboxed frame cannot be measured from outside, so it reports its own
 * height. The page checks the message came from this frame and clamps the number.
 */
const RESIZER = `(function(){function p(){var h=Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0);parent.postMessage({source:${JSON.stringify(WIDGET_MESSAGE_SOURCE)},height:h},"*")}if("ResizeObserver" in window&&document.body){new ResizeObserver(p).observe(document.body)}window.addEventListener("load",p);setInterval(p,1500)})();`

/** The whole document the widget runs in, or null when the spec is not safe to build. */
export function buildWidgetDocument(spec: WidgetSpec): string | null {
  if (widgetProblems(spec).length > 0) return null
  const script = checkScriptUrl(spec.scriptUrl)
  if (!script.ok) return null
  const attrs = (spec.attributes ?? []).filter((a) => a.name && isDataAttribute(a.name)).map((a) => ` ${a.name}="${esc(a.value ?? '')}"`).join('')
  const id = spec.elementId ? ` id="${esc(spec.elementId)}"` : ''
  const init = spec.initEvent ? `<script>window.dispatchEvent(new Event(${JSON.stringify(spec.initEvent)}));</script>` : ''
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="referrer" content="strict-origin-when-cross-origin">',
    `<meta http-equiv="Content-Security-Policy" content="object-src 'none'">`,
    '<style>html,body{margin:0}body{font-family:system-ui,sans-serif}</style></head><body>',
    `<div${id}${attrs}></div>`,
    init,
    `<script${spec.module ? ' type="module"' : ''} src="${esc(script.url)}"></script>`,
    `<script>${RESIZER}</script>`,
    '</body></html>',
  ].join('')
}

/** The height a widget frame reported, clamped; null for any message that is not one. */
export function parseSizeMessage(data: unknown): number | null {
  if (typeof data !== 'object' || data === null) return null
  const d = data as { source?: unknown; height?: unknown }
  if (d.source !== WIDGET_MESSAGE_SOURCE || typeof d.height !== 'number' || !Number.isFinite(d.height)) return null
  return clampHeight(d.height)
}
