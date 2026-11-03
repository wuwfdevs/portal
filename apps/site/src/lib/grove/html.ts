// Grove's rich-text chunks (HTML strings) to editor content. A real parser, not a pattern match: the HTML is messy
// (unclosed tags, Word leftovers, empty paragraphs by the dozen). The rule throughout is the migration plan's gate:
// nothing is dropped without being said. Whatever cannot become editor content becomes a block or a link, and the
// report says so; a script is never imported.

import { parseFragment, serializeOuter } from 'parse5'
import type { DefaultTreeAdapterMap } from 'parse5'

import { absoluteUrl, plainText, safeHref, type Ctx } from './context'
import { isLinkLineUrl } from '../link-line'
import { checkScriptUrl, DEFAULT_WIDGET_HEIGHT } from '../widgets'
import { embedNode } from './embed'
import * as lex from './lexical'
import type { Align } from './lexical'
import type { LexNode } from './types'

type PNode = DefaultTreeAdapterMap['node']
type El = DefaultTreeAdapterMap['element']
type Piece = { inline: LexNode } | { block: LexNode[] }

const isEl = (n: PNode): n is El => 'tagName' in n
const isText = (n: PNode): n is DefaultTreeAdapterMap['textNode'] => n.nodeName === '#text'
const attr = (el: El, name: string): string | undefined => el.attrs.find((a) => a.name === name)?.value
const kids = (el: El): PNode[] => el.childNodes as PNode[]
const num = (v: string | undefined): number | undefined => (v && /^\d{1,5}$/.test(v) ? Number(v) : undefined)

const FORMAT_TAGS: Record<string, number> = {
  b: lex.FORMAT.bold, strong: lex.FORMAT.bold,
  i: lex.FORMAT.italic, em: lex.FORMAT.italic, cite: lex.FORMAT.italic,
  u: lex.FORMAT.underline, ins: lex.FORMAT.underline,
  s: lex.FORMAT.strikethrough, strike: lex.FORMAT.strikethrough, del: lex.FORMAT.strikethrough,
  sup: lex.FORMAT.superscript, sub: lex.FORMAT.subscript,
  code: lex.FORMAT.code, kbd: lex.FORMAT.code, tt: lex.FORMAT.code,
}
/** Tags that carry formatting we do not keep; unwrapped, their text stays. */
const UNWRAP_QUIET = new Set(['span', 'small', 'big', 'wbr', 'mark', 'abbr', 'label', 'time', 'o:p', 'font', 'bdi', 'bdo', 'q', 'dfn', 'var', 'samp'])
const DROPPED = new Set(['script', 'style', 'noscript', 'template', 'head', 'meta', 'link', 'title'])
const BLOCK_TAGS = new Set(['p', 'div', 'ul', 'ol', 'table', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'pre', 'section', 'article', 'footer', 'header', 'aside', 'main', 'center', 'figure', 'figcaption', 'dl', 'form', 'address', 'nav', 'fieldset'])

const alignOf = (el: El): Align | undefined => {
  const cls = attr(el, 'class') ?? ''
  const m = /cms-textAlign-(center|right|left|justify)/.exec(cls)
  if (m) return m[1] as Align
  const style = attr(el, 'style') ?? ''
  const s = /text-align:\s*(center|right|left|justify)/i.exec(style)
  return s ? (s[1]!.toLowerCase() as Align) : undefined
}

// ---- inline content -------------------------------------------------------------------------------------------

/** `inLink`: the text is a link's words. `repaired`: this text already came from re-reading typed markup (never do it twice). */
type InlineOpts = { inLink?: boolean; repaired?: boolean }

function inlinePieces(nodes: PNode[], fmt: number, ctx: Ctx, opt: InlineOpts = {}): Piece[] {
  const out: Piece[] = []
  for (const n of nodes) {
    if (isText(n)) {
      if (!opt.repaired && looksTyped(n.value)) {
        const typed = typedPieces(n.value, fmt, ctx, !!opt.inLink)
        if (typed) {
          out.push(...typed)
          continue
        }
      }
      const value = n.value.replace(/[ \t\r\n\f]+/g, ' ')
      if (value) out.push({ inline: lex.text(value, fmt) })
      continue
    }
    if (!isEl(n)) continue // comments and the like
    const tag = n.tagName
    if (DROPPED.has(tag)) {
      dropped(n, ctx)
    } else if (tag === 'brightspot-cms-external-content') {
      // Grove wraps a pasted video or post address in this element and keeps the address in `data-state`.
      let url: unknown
      try {
        url = (JSON.parse(attr(n, 'data-state') ?? '{}') as { url?: unknown }).url
      } catch {
        url = undefined
      }
      if (typeof url === 'string') {
        const e = embedNode(url, ctx)
        if (e) out.push({ block: [e] })
        ctx.note('html.external-content-embedded')
      } else {
        ctx.note('html.external-content-without-address')
        out.push(...inlinePieces(kids(n), fmt, ctx, opt))
      }
    } else if (tag in FORMAT_TAGS) {
      out.push(...inlinePieces(kids(n), fmt | FORMAT_TAGS[tag]!, ctx, opt))
    } else if (tag === 'br') {
      out.push({ inline: lex.linebreak() })
    } else if (tag === 'a') {
      out.push(...linkPieces(n, fmt, ctx))
    } else if (tag === 'img') {
      const b = imageNode(n, ctx)
      if (b) out.push({ block: [b] })
    } else if (tag === 'iframe') {
      const b = iframeNode(n, ctx)
      if (b) out.push({ block: [b] })
    } else if (BLOCK_TAGS.has(tag)) {
      out.push({ block: blocksFromNodes([n], ctx) })
    } else {
      if (tag === 'font' && (attr(n, 'color') || attr(n, 'size') || attr(n, 'face') || attr(n, 'style'))) ctx.note('html.font-formatting-dropped')
      else if (!UNWRAP_QUIET.has(tag)) ctx.note('html.unwrapped-tag', tag)
      out.push(...inlinePieces(kids(n), fmt, ctx, opt))
    }
  }
  return out
}

// ---- markup typed as words ----------------------------------------------------------------------------------------

/**
 * Grove editors sometimes typed markup into the visible text, and it was stored as the characters, not as formatting:
 * `<i>Frontiers in Psychology</i>` as the words of a link, `Listen</i></b>`, `1<sup>st</sup>`, a `<br>` in a line, a
 * `&nbsp;`. (In the census: 50 stories, 85 repairs.) Such text is read again as HTML, by the same parser and the same rules
 * as the rest of the page, so the formatting it asked for is applied and the tags are gone.
 *
 * It only happens when the text carries a closing tag of a formatting tag we know, a `<br>` or `<wbr>`, or a `&nbsp;`, so
 * a sentence that merely mentions an opening tag ("use <b> for bold") is never touched.
 */
const TYPED_NAMES = 'b|strong|i|em|u|ins|s|strike|del|sup|sub|font|span|small|big|mark|cite|code|kbd|tt'
const TYPED_CLOSING = new RegExp(`</(?:${TYPED_NAMES})\\s*>`, 'i')
const TYPED_BREAK = /<(?:br|wbr)(?:\s[^>]*)?\/?>/i
const TYPED_EMPTY = new RegExp(`<(${TYPED_NAMES})(?:\\s[^>]*)?>\\s*</\\1\\s*>`, 'gi')

/** Only formatting is ever read back out of typed text. A typed `<img>`, `<iframe>`, `<a>`, `<script>` or Grove element stays the characters it was. */
const TYPED_OK = new Set([...TYPED_NAMES.split('|'), 'br', 'wbr'])
const onlyFormatting = (value: string): boolean => [...value.matchAll(/<\/?([a-zA-Z][\w:-]*)/g)].every((m) => TYPED_OK.has(m[1]!.toLowerCase()))

function looksTyped(value: string): boolean {
  return value.includes('<') || value.includes('&') ? TYPED_CLOSING.test(value) || TYPED_BREAK.test(value) || /&nbsp;/i.test(value) : false
}

/** True when the converter would read this text again as formatting (typed tags it knows, and nothing else): the mark of a story imported before the repair. */
export const isTypedMarkup = (value: string): boolean => looksTyped(value) && onlyFormatting(value)

/** The text read again as HTML, or null when it holds anything but formatting (it is then left exactly as it was). */
function typedPieces(value: string, fmt: number, ctx: Ctx, inLink: boolean): Piece[] | null {
  if (!onlyFormatting(value)) return null
  // An empty typed pair ("<b> </b>" in front of the real words) says nothing, so it goes wherever it sits.
  const pieces = inlinePieces(parseFragment(value.replace(TYPED_EMPTY, '')).childNodes as PNode[], fmt, ctx, { inLink, repaired: true })
  if (pieces.some((p) => 'block' in p)) return null
  ctx.note(inLink ? 'link.escaped-markup-repaired' : 'text.escaped-markup-repaired')
  const inline = pieces.flatMap((p) => ('inline' in p ? [p.inline] : []))
  // A link's own words carry no stray spaces at either end (a typed `&nbsp;` before the closing tag was one).
  return (inLink ? trimRun(inline) : inline).map((x) => ({ inline: x }))
}

function linkPieces(a: El, fmt: number, ctx: Ctx): Piece[] {
  const pieces = inlinePieces(kids(a), fmt, ctx, { inLink: true })
  const inline = pieces.flatMap((p) => ('inline' in p ? [p.inline] : []))
  const blocks = pieces.flatMap((p) => ('block' in p ? [{ block: p.block } as Piece] : []))
  const href = attr(a, 'href')
  let safe = safeHref(href)
  if (!safe || 'refused' in safe) {
    // When the address is unusable but the visible text is itself an address, link the text: the reader can see it.
    const visible = inline.map((n) => (n.type === 'text' ? String(n.text) : '')).join('').trim()
    const rescued = /^https?:\/\/\S+$/.test(visible) ? safeHref(visible) : null
    if (rescued && 'url' in rescued) {
      safe = rescued
      ctx.note('link.address-taken-from-text')
    } else {
      // An address polluted with markup is a known Grove artefact (the video element above carries the real one).
      if (safe && 'refused' in safe) {
        if (safe.refused.startsWith('<')) ctx.note('link.polluted-address-dropped')
        else ctx.preserve('link.unsafe-address-removed', safe.refused)
      } else if (inline.length) ctx.note('link.without-address')
      return pieces // the text stays, the link does not
    }
  }
  if (blocks.length) ctx.note('link.around-picture-flattened')
  const out: Piece[] = []
  if (inline.length) {
    out.push({ inline: lex.link(safe.url, attr(a, 'target') === '_blank', mergeText(inline)) })
    ctx.count('link')
  } else if (!blocks.length) {
    // A link with nothing to read (or only a typed &nbsp;) has nowhere to be clicked, so it goes, and the report says so.
    ctx.note('link.empty-text')
  }
  return [...out, ...blocks]
}

/** Join neighbouring text runs that have the same format, so the editor sees clean runs. */
export function mergeText(nodes: LexNode[]): LexNode[] {
  const out: LexNode[] = []
  for (const n of nodes) {
    const prev = out[out.length - 1]
    if (prev && prev.type === 'text' && n.type === 'text' && prev.format === n.format) out[out.length - 1] = lex.text(String(prev.text) + String(n.text), Number(n.format))
    else out.push(n)
  }
  return out
}

/** Trim the ends of a run of inline nodes: no leading or trailing spaces or line breaks. Empty when nothing is left. */
function trimRun(nodes: LexNode[]): LexNode[] {
  const run = mergeText(nodes)
  while (run.length && run[0]!.type === 'linebreak') run.shift()
  while (run.length && run[run.length - 1]!.type === 'linebreak') run.pop()
  const first = run[0]
  if (first && first.type === 'text') run[0] = lex.text(String(first.text).replace(/^\s+/, ''), Number(first.format))
  const last = run[run.length - 1]
  if (last && last.type === 'text') run[run.length - 1] = lex.text(String(last.text).replace(/\s+$/, ''), Number(last.format))
  const kept = run.filter((n) => !(n.type === 'text' && n.text === ''))
  const visible = kept.some((n) => n.type === 'link' || n.type === 'linebreak' || (n.type === 'text' && String(n.text).replace(/[\s ]+/g, '') !== ''))
  return visible ? kept : []
}

// ---- "RELATED:" lines -------------------------------------------------------------------------------------------

/** The word or two an editor put before the link: "RELATED:", "Related story –", "Related coverage". */
const RELATED_LABEL = /^related(?:\s+(?:story|stories|coverage|reading|content|links?))?\s*[:\-–—]?$/i

const nodeText = (n: LexNode): string =>
  n.type === 'text' ? String(n.text) : n.type === 'linebreak' ? ' ' : ((n.children as LexNode[] | undefined) ?? []).map(nodeText).join('')

/**
 * Grove had no element for pointing at another story; editors typed a label and a link into a paragraph. A paragraph that is
 * exactly that (only plain text saying "Related", then one link to a page, and nothing after it) becomes a `linkLine`
 * block. A paragraph with anything else in it, a second link, or a link that is not a page address stays a paragraph.
 */
function relatedLineBlock(run: LexNode[], ctx: Ctx): LexNode | null {
  const at = run.findIndex((n) => n.type === 'link')
  if (at < 1 || at !== run.length - 1 || run.slice(0, at).some((n) => n.type !== 'text')) return null
  const labelText = run.slice(0, at).map(nodeText).join('').replace(/\s+/g, ' ').trim()
  if (!RELATED_LABEL.test(labelText)) return null
  const l = run[at]!
  const { url, newTab } = l.fields as { url: string; newTab?: boolean }
  const headline = nodeText(l).replace(/\s+/g, ' ').trim()
  // Only an address the block will accept (a page here, http or https; not an email): a line the editor would refuse to save stays a paragraph.
  if (!headline || /^mailto:/i.test(url) || !isLinkLineUrl(url)) return null
  const words = labelText.replace(/\s*[:\-–—]$/, '')
  const label = words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
  ctx.count('block:linkLine')
  ctx.count('linkLine:related')
  return lex.block(ctx.id(), 'linkLine', { label, linkText: headline, url, ...(newTab ? { newTab: true } : {}) })
}

// ---- the stock "Support Local Stories. Donate Here." line -------------------------------------------------------

/** The page Grove's stock support line pointed at (50 of the 1,513 census stories). Matched on the path alone. */
const GROVE_SUPPORT_PATHS = new Set(['/thanks-for-your-support'])
/** Where every one of those lines goes on this site: the Support page (owner decision, 2026-11-03). */
const SUPPORT_PAGE_PATH = '/support'

/**
 * Editors typed a short bold sentence and a link to Grove's donation page into a paragraph. A paragraph that is exactly
 * that (plain text of at most 80 characters, one link to that address, nothing after it but a full stop) becomes a
 * `linkLine` block (the sentence is its label). Grove's donation page does not exist here, so the block links to the Support
 * page instead, and the report names the address it replaced so every affected story can be found. (`redirects.ts` sends
 * the old address there too, for any other place it is still used.)
 * A sentence of prose that merely contains such a link is not this line, and stays a paragraph.
 */
function supportLineBlock(run: LexNode[], ctx: Ctx): LexNode | null {
  const at = run.findIndex((n) => n.type === 'link')
  if (at < 1 || run.slice(0, at).some((n) => n.type !== 'text') || run.slice(at + 1).some((n) => n.type !== 'text')) return null
  const l = run[at]!
  const { url } = l.fields as { url: string }
  const path = url.split(/[?#]/)[0]!.replace(/\/+$/, '').toLowerCase()
  if (!GROVE_SUPPORT_PATHS.has(path)) return null
  const message = run.slice(0, at).map(nodeText).join('').replace(/\s+/g, ' ').trim()
  const linkText = nodeText(l).replace(/\s+/g, ' ').trim()
  const after = run.slice(at + 1).map(nodeText).join('').trim()
  if (!message || message.length > 80 || !linkText || !/^[.!]?$/.test(after) || !isLinkLineUrl(url)) return null
  ctx.count('block:linkLine')
  ctx.count('linkLine:support')
  ctx.note('support.appeal-sent-to-support-page', path)
  return lex.block(ctx.id(), 'linkLine', { label: message, linkText, url: SUPPORT_PAGE_PATH })
}

// ---- pictures, frames, dropped things -------------------------------------------------------------------------

function imageNode(el: El, ctx: Ctx): LexNode | null {
  const sourceUrl = absoluteUrl(attr(el, 'src'))
  if (!sourceUrl) {
    ctx.preserve('image.no-address', (attr(el, 'src') ?? '').slice(0, 40))
    return null
  }
  const alt = plainText(attr(el, 'alt')).text
  const token = ctx.asset({ kind: 'image', sourceUrl, ...(alt ? { alt } : {}), ...(num(attr(el, 'width')) ? { width: num(attr(el, 'width'))! } : {}), ...(num(attr(el, 'height')) ? { height: num(attr(el, 'height'))! } : {}) })
  ctx.count('block:mediaBlock')
  ctx.count('image:inline')
  return lex.block(ctx.id(), 'mediaBlock', { media: token, ...(alt ? { altText: alt } : {}), alignment: 'full' })
}

function iframeNode(el: El, ctx: Ctx): LexNode | null {
  const src = attr(el, 'src')
  if (!src) {
    ctx.preserve('embed.no-address', 'iframe without src')
    return null
  }
  const title = attr(el, 'title')
  return embedNode(src, ctx, { ...(title ? { title: plainText(title).text } : {}), ...(num(attr(el, 'width')) ? { width: num(attr(el, 'width'))! } : {}), ...(num(attr(el, 'height')) ? { height: num(attr(el, 'height'))! } : {}) })
}

function dropped(el: El, ctx: Ctx): void {
  if (el.tagName === 'script') {
    const src = attr(el, 'src')
    // NPR's Pym loader only exists to turn a placeholder into a frame; the frame is already in the story.
    if (ctx.pymFrame && src && /\/pym(\.min)?\.js(\?|$)/.test(src)) ctx.note('embed.pym-loader-replaced', new URL(src, 'https://x.invalid').hostname)
    else ctx.preserve('html.script-removed', src ? new URL(src, 'https://x.invalid').hostname : 'inline')
  } else if (el.tagName === 'noscript') ctx.note('html.noscript-removed')
  else ctx.note('html.element-removed', el.tagName)
}

// ---- script widgets -------------------------------------------------------------------------------------------

/**
 * Grove let a pasted widget run in the page: a container with an id and `data-*` settings that holds (or is followed
 * by) a one-line script dispatching an event, then a script from the widget's own site. That exact shape becomes a `widget`
 * block (the script runs in an isolated frame, after a click). Anything else stays a removed, flagged script.
 */
const INIT_EVENT = /^\s*window\.dispatchEvent\(\s*new\s+Event\(\s*(['"])([A-Za-z][\w:.-]{0,60})\1\s*\)\s*\)\s*;?\s*$/
const isBlankText = (n: PNode): boolean => isText(n) && n.value.trim() === ''

function widgetAt(nodes: PNode[], i: number, ctx: Ctx): { node: LexNode; consumed: number } | null {
  const div = nodes[i]
  if (!div || !isEl(div) || div.tagName !== 'div') return null
  const id = attr(div, 'id')
  const data = div.attrs.filter((a) => /^data-[a-z0-9][a-z0-9_.-]{0,60}$/.test(a.name))
  if (!id || data.length === 0) return null
  // The one-line event script sits inside the container in Grove's real data (and beside it in some pastes).
  let init: string | undefined
  for (const k of kids(div)) {
    if (isBlankText(k)) continue
    const m = isEl(k) && k.tagName === 'script' && !attr(k, 'src') ? INIT_EVENT.exec(kids(k).map((c) => (isText(c) ? c.value : '')).join('')) : null
    if (!m || init) return null
    init = m[2]
  }
  let src: El | undefined
  let last = i
  for (let j = i + 1; j < nodes.length; j++) {
    const n = nodes[j]!
    if (isBlankText(n)) continue
    if (!isEl(n) || n.tagName !== 'script') break
    const s = attr(n, 'src')
    if (s) {
      if (src) break
      src = n
      last = j
      break
    }
    const m = INIT_EVENT.exec(kids(n).map((k) => (isText(k) ? k.value : '')).join(''))
    if (!m || init) break
    init = m[2]
    last = j
  }
  if (!src) return null
  const abs = absoluteUrl(attr(src, 'src')!)
  const check = abs ? checkScriptUrl(abs) : null
  if (!check || !check.ok) return null
  ctx.count('block:widget')
  ctx.note('widget.script-embedded', check.host)
  const node = lex.block(ctx.id(), 'widget', {
    title: `Interactive content from ${check.host}`,
    scriptUrl: check.url,
    ...(attr(src, 'type') === 'module' ? { module: true } : {}),
    elementId: id,
    attributes: data.map((a) => ({ id: ctx.id(), name: a.name, value: a.value })),
    ...(init ? { initEvent: init } : {}),
    height: DEFAULT_WIDGET_HEIGHT,
  })
  return { node, consumed: last - i }
}

// ---- block content --------------------------------------------------------------------------------------------

/** The status address inside an embedded post from X, or null. */
const TWEET = /^https?:\/\/(?:www\.|mobile\.)?(?:twitter|x)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d{5,25}/

function findAnchors(nodes: PNode[]): El[] {
  const out: El[] = []
  for (const n of nodes) if (isEl(n)) { if (n.tagName === 'a') out.push(n); out.push(...findAnchors(kids(n))) }
  return out
}

function blocksFromNodes(nodes: PNode[], ctx: Ctx, align?: Align): LexNode[] {
  const out: LexNode[] = []
  let buf: LexNode[] = []
  let bufAlign = align
  const flush = () => {
    const run = trimRun(buf)
    buf = []
    if (run.length) {
      const special = relatedLineBlock(run, ctx) ?? supportLineBlock(run, ctx)
      if (special) out.push(special)
      else {
        out.push(lex.paragraph(run, bufAlign))
        ctx.count('paragraph')
      }
    }
  }
  const consume = (pieces: Piece[]) => {
    for (const p of pieces) {
      if ('inline' in p) buf.push(p.inline)
      else {
        flush()
        out.push(...p.block)
      }
    }
  }
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!
    if (isText(n)) {
      consume(inlinePieces([n], 0, ctx))
      continue
    }
    if (!isEl(n)) continue
    const tag = n.tagName
    const widget = tag === 'div' ? widgetAt(nodes, i, ctx) : null
    if (widget) {
      flush()
      out.push(widget.node)
      i += widget.consumed
    } else if (tag === 'p' && attr(n, 'data-pym-src')) {
      // An NPR interactive: Pym's script would build this frame; we embed the same address directly.
      flush()
      const e = embedNode(attr(n, 'data-pym-src')!, ctx)
      if (e) {
        out.push(e)
        ctx.pymFrame = true
        ctx.note('embed.pym-as-frame')
      }
    } else if (tag === 'p' || tag === 'pre' || tag === 'figcaption' || tag === 'address') {
      flush()
      bufAlign = alignOf(n) ?? align
      consume(inlinePieces(kids(n), 0, ctx))
      flush()
      bufAlign = align
    } else if (/^h[1-6]$/.test(tag)) {
      flush()
      const run = trimRun(inlinePieces(kids(n), 0, ctx).flatMap((p) => ('inline' in p ? [p.inline] : [])))
      if (run.length) {
        if (tag === 'h1') ctx.note('heading.h1-became-h2')
        out.push(lex.heading(tag === 'h1' ? 'h2' : (tag as 'h2'), run))
        ctx.count('heading')
      }
    } else if (tag === 'ul' || tag === 'ol') {
      flush()
      out.push(...listNodes(n, ctx))
    } else if (tag === 'blockquote') {
      flush()
      out.push(...quoteNodes(n, ctx))
    } else if (tag === 'hr') {
      flush()
      out.push(lex.horizontalRule())
      ctx.count('horizontalrule')
    } else if (tag === 'table') {
      flush()
      out.push(lex.block(ctx.id(), 'legacyHtml', { html: serializeOuter(n), note: 'Table from Grove' }))
      ctx.count('block:legacyHtml')
      ctx.preserve('html.table-preserved')
    } else if (tag === 'div' && /\bfb-post\b/.test(attr(n, 'class') ?? '') && attr(n, 'data-href')) {
      flush()
      const e = embedNode(attr(n, 'data-href')!, ctx, { caption: plainText(serializeOuter(n)).text || undefined })
      if (e) out.push(e)
    } else if (BLOCK_TAGS.has(tag) || tag === 'span') {
      // a container: its contents are the content (a `center` also centres what it holds)
      flush()
      const inner = blocksFromNodes(kids(n), ctx, tag === 'center' ? 'center' : (alignOf(n) ?? align))
      out.push(...inner)
    } else {
      consume(inlinePieces([n], 0, ctx))
    }
  }
  flush()
  return out
}

function quoteNodes(el: El, ctx: Ctx): LexNode[] {
  if (/\btwitter-tweet\b/.test(attr(el, 'class') ?? '')) {
    const status = findAnchors(kids(el)).map((a) => attr(a, 'href') ?? '').filter((h) => TWEET.test(h)).pop()
    if (status) {
      const para = kids(el).find((c): c is El => isEl(c) && c.tagName === 'p')
      const caption = para ? plainText(serializeOuter(para)).text : ''
      const e = embedNode(status, ctx, caption ? { caption } : {})
      if (e) return [e]
    }
    ctx.note('html.tweet-blockquote-without-link')
  }
  // Each paragraph of a quotation becomes a line of one quote. Anything that cannot sit inside a quote (a picture, a
  // list) follows it as its own block.
  const lines: LexNode[][] = []
  const after: LexNode[] = []
  const take = (nodes: PNode[]) => {
    const pieces = inlinePieces(nodes, 0, ctx)
    const run = trimRun(pieces.flatMap((p) => ('inline' in p ? [p.inline] : [])))
    if (run.length) lines.push(run)
    for (const p of pieces) if ('block' in p) after.push(...p.block)
  }
  const parts = kids(el)
  if (parts.some((c) => isEl(c) && c.tagName === 'p')) for (const c of parts) take(isEl(c) && c.tagName === 'p' ? kids(c) : [c])
  else take(parts)
  const inner: LexNode[] = []
  lines.forEach((l, i) => {
    if (i > 0) inner.push(lex.linebreak())
    inner.push(...l)
  })
  if (!inner.length) return after
  ctx.count('quote')
  return [lex.quote(inner), ...after]
}

function listNodes(el: El, ctx: Ctx): LexNode[] {
  const ordered = el.tagName === 'ol'
  const items: LexNode[] = []
  const hoisted: LexNode[] = []
  let value = 1
  for (const li of kids(el)) {
    if (!isEl(li) || li.tagName !== 'li') continue
    let run: LexNode[] = []
    const closeItem = () => {
      const t = trimRun(run)
      run = []
      if (t.length) items.push(lex.listItem(t, value++))
    }
    for (const c of kids(li)) {
      if (isEl(c) && (c.tagName === 'ul' || c.tagName === 'ol')) {
        closeItem()
        const nested = listNodes(c, ctx)
        for (const l of nested) items.push(lex.listItem([l], value++))
        continue
      }
      for (const p of inlinePieces([c], 0, ctx)) {
        if ('inline' in p) run.push(p.inline)
        else
          for (const b of p.block) {
            // a paragraph inside a list item is just its text; anything else cannot live inside a list item
            if (b.type === 'paragraph') {
              if (run.length) run.push(lex.linebreak())
              run.push(...(b.children as LexNode[]))
            } else hoisted.push(b)
          }
      }
    }
    closeItem()
  }
  if (!items.length) return hoisted
  ctx.count('list')
  return [lex.list(ordered, items), ...hoisted]
}

/** Grove's rich-text HTML (one or more fragments joined) to editor nodes. */
export function htmlToNodes(html: string, ctx: Ctx): LexNode[] {
  if (!html.trim()) return []
  return blocksFromNodes(parseFragment(html).childNodes as PNode[], ctx)
}
