// A drawing made on the server (Observable Plot, run against a small DOM) becomes a plain tree that React draws. Nothing is ever injected as
// HTML: the tree holds only the tags and attributes below, so a column heading or a feature name that looks like markup is text, and a
// drawing cannot carry a script, a link, an image or a style sheet however it was made. (`dangerouslySetInnerHTML` is allowed in one place
// in this app, and this is not it.) Pure: it reads a minimal element shape, so a test needs no DOM.

export interface SvgNode {
  tag: string
  attrs: Record<string, string>
  /** Inline style, only the properties below, by their camel-cased names. */
  style?: Record<string, string>
  children: Array<SvgNode | string>
}

/** The part of a DOM element this reads. */
export interface DomLike {
  nodeType: number
  localName?: string
  nodeName?: string
  textContent?: string | null
  attributes?: ArrayLike<{ name: string; value: string }>
  childNodes?: ArrayLike<DomLike>
}

const TAGS: Record<string, string> = {
  svg: 'svg', g: 'g', path: 'path', rect: 'rect', line: 'line', circle: 'circle', ellipse: 'ellipse', polyline: 'polyline', polygon: 'polygon',
  text: 'text', tspan: 'tspan', title: 'title', desc: 'desc', defs: 'defs', clippath: 'clipPath', lineargradient: 'linearGradient', stop: 'stop',
}

const ATTRS = new Set([
  'width', 'height', 'viewBox', 'preserveAspectRatio', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'transform', 'dx', 'dy',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-miterlimit',
  'opacity', 'class', 'id', 'text-anchor', 'dominant-baseline', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'clip-path',
  'aria-label', 'aria-hidden', 'role', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'clipPathUnits', 'shape-rendering', 'paint-order',
  'x1', 'xmlns',
])

const STYLE_PROPS = new Set(['font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'fill', 'stroke', 'stroke-width', 'opacity', 'paint-order', 'overflow', 'display'])

const MAX_NODES = 20_000

/** `url(#id)` only, with the id kept inside this drawing; anything else (a web address, a data URI) is not a paint server. */
const LOCAL_URL = /^url\(\s*#([A-Za-z0-9_:.-]+)\s*\)$/
/** Paint values: names, hex, rgb(), hsl(), `none`, `currentColor`, `url(#id)`. */
const SAFE_VALUE = /^[A-Za-z0-9#%.,()\s_:/-]*$/

const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

function safeValue(name: string, value: string, prefix: string): string | null {
  if (name === 'id') return /^[A-Za-z][A-Za-z0-9_:.-]*$/.test(value) ? `${prefix}${value}` : null
  if (value.length > 20_000) return null
  const url = LOCAL_URL.exec(value.trim())
  if (url) return `url(#${prefix}${url[1]})`
  if (/url\(|javascript:|expression\(|<|>/i.test(value)) return null
  if (name === 'd' || name === 'points' || name === 'transform' || name === 'viewBox' || name === 'stroke-dasharray' || name === 'gradientTransform') return /^[-+0-9.eE,\s()a-zA-Z]*$/.test(value) ? value : null
  if (name === 'class' || name.startsWith('aria-') || name === 'role' || name === 'font-family') return value.length <= 500 && !/[<>]/.test(value) ? value : null
  return SAFE_VALUE.test(value) ? value : null
}

function styleOf(raw: string): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const part of raw.split(';')) {
    const i = part.indexOf(':')
    if (i < 0) continue
    const prop = part.slice(0, i).trim().toLowerCase()
    const value = part.slice(i + 1).trim()
    if (STYLE_PROPS.has(prop) && value !== '' && !/url\(|javascript:|expression\(|[<>{}]/i.test(value)) out[camel(prop)] = value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * The tree for one element, or null when the root is not an `svg`. `idPrefix` is put in front of every id and every `url(#…)` so two drawings on one
 * page (or the wide and narrow drawings of one chart) never share an id.
 */
export function toSvgTree(root: DomLike, idPrefix = ''): SvgNode | null {
  let budget = MAX_NODES
  const walk = (node: DomLike): SvgNode | string | null => {
    if (--budget < 0) return null
    if (node.nodeType === 3) return node.textContent ?? ''
    if (node.nodeType !== 1) return null
    const tag = TAGS[(node.localName ?? node.nodeName ?? '').toLowerCase()]
    if (!tag) return null
    const attrs: Record<string, string> = {}
    let style: Record<string, string> | undefined
    for (const a of Array.from(node.attributes ?? [])) {
      if (a.name === 'style') {
        style = styleOf(a.value)
        continue
      }
      if (!ATTRS.has(a.name) || a.name === 'xmlns') continue
      const v = safeValue(a.name, a.value, idPrefix)
      if (v !== null) attrs[a.name] = v
    }
    const children: Array<SvgNode | string> = []
    for (const c of Array.from(node.childNodes ?? [])) {
      const t = walk(c)
      if (t !== null) children.push(t)
    }
    const out: SvgNode = { tag, attrs, children }
    if (style) out.style = style
    return out
  }
  const tree = walk(root)
  return tree && typeof tree !== 'string' && tree.tag === 'svg' ? tree : null
}

/** The React prop name for an attribute: `stroke-width` is `strokeWidth`; `class` is `className`; `aria-` and `data-` keep their hyphen. */
export function reactAttr(name: string): string {
  if (name === 'class') return 'className'
  if (name.startsWith('aria-') || name.startsWith('data-')) return name
  return camel(name)
}
