// Grove's rich-text chunks (HTML strings) to editor content. A real parser, not a pattern match: the HTML is messy
// (unclosed tags, Word leftovers, empty paragraphs by the dozen). The rule throughout is the migration plan's gate:
// nothing is dropped without being said. Whatever cannot become editor content becomes a block or a link, and the
// report says so; a script is never imported.

import { parseFragment, serializeOuter } from 'parse5'
import type { DefaultTreeAdapterMap } from 'parse5'

import { absoluteUrl, plainText, safeHref, type Ctx } from './context'
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

function inlinePieces(nodes: PNode[], fmt: number, ctx: Ctx): Piece[] {
  const out: Piece[] = []
  for (const n of nodes) {
    if (isText(n)) {
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
        out.push(...inlinePieces(kids(n), fmt, ctx))
      }
    } else if (tag in FORMAT_TAGS) {
      out.push(...inlinePieces(kids(n), fmt | FORMAT_TAGS[tag]!, ctx))
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
      out.push(...inlinePieces(kids(n), fmt, ctx))
    }
  }
  return out
}

function linkPieces(a: El, fmt: number, ctx: Ctx): Piece[] {
  const pieces = inlinePieces(kids(a), fmt, ctx)
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
    ctx.preserve('html.script-removed', src ? new URL(src, 'https://x.invalid').hostname : 'inline')
  } else if (el.tagName === 'noscript') ctx.note('html.noscript-removed')
  else ctx.note('html.element-removed', el.tagName)
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
      out.push(lex.paragraph(run, bufAlign))
      ctx.count('paragraph')
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
  for (const n of nodes) {
    if (isText(n)) {
      consume(inlinePieces([n], 0, ctx))
      continue
    }
    if (!isEl(n)) continue
    const tag = n.tagName
    if (tag === 'p' || tag === 'pre' || tag === 'figcaption' || tag === 'address') {
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
