// Builders for the editor's JSON and the checks that keep what we emit inside what the editor and the story blocks
// accept. Payload drops a block type a field does not allow without any error, so the converter validates its own
// output here instead of finding out later.

import type { BlockItem, LexNode, LexicalState } from './types'

/** Text format bits, as the editor stores them. */
export const FORMAT = { bold: 1, italic: 2, strikethrough: 4, underline: 8, code: 16, subscript: 32, superscript: 64 } as const

export type Align = 'left' | 'center' | 'right' | 'justify'

export const text = (value: string, format = 0): LexNode => ({ type: 'text', version: 1, text: value, format, mode: 'normal', style: '', detail: 0 })
export const linebreak = (): LexNode => ({ type: 'linebreak', version: 1 })
export const link = (url: string, newTab: boolean, children: LexNode[]): LexNode => ({
  type: 'link', version: 3, format: '', indent: 0, direction: 'ltr', fields: { linkType: 'custom', url, newTab }, children,
})
export const paragraph = (children: LexNode[], align?: Align): LexNode => ({
  type: 'paragraph', version: 1, direction: 'ltr', format: align ?? '', indent: 0, textFormat: 0, children,
})
export const heading = (tag: 'h2' | 'h3' | 'h4' | 'h5' | 'h6', children: LexNode[]): LexNode => ({
  type: 'heading', version: 1, tag, direction: 'ltr', format: '', indent: 0, children,
})
export const quote = (children: LexNode[]): LexNode => ({ type: 'quote', version: 1, direction: 'ltr', format: '', indent: 0, children })
export const horizontalRule = (): LexNode => ({ type: 'horizontalrule', version: 1 })
export const listItem = (children: LexNode[], value: number): LexNode => ({ type: 'listitem', version: 1, direction: 'ltr', format: '', indent: 0, value, children })
export const list = (ordered: boolean, items: LexNode[]): LexNode => ({
  type: 'list', version: 1, listType: ordered ? 'number' : 'bullet', tag: ordered ? 'ol' : 'ul', start: 1, direction: 'ltr', format: '', indent: 0, children: items,
})
export const block = (id: string, blockType: string, fields: Record<string, unknown>): LexNode => ({
  type: 'block', version: 2, format: '', fields: { id, blockType, ...fields },
})
export const root = (children: LexNode[]): LexicalState => ({
  root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: children.length ? children : [paragraph([])] },
})

/** A stable 24-character id, so converting the same page twice gives identical output (diffable, re-runnable). */
export function stableId(seed: string, n: number): string {
  // cyrb53, run twice with different seeds for 106 bits, rendered as 24 hex characters.
  const h = (s: string, k: number) => {
    let h1 = 0xdeadbeef ^ k, h2 = 0x41c6ce57 ^ k
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i)
      h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677)
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
  }
  const key = `${seed}:${n}`
  return (h(key, 1) + h(key, 2)).slice(0, 24)
}

/** The block types a story body may hold, and the ones that may open a story. Must match `blocks/body.ts`. */
export const BODY_BLOCK_TYPES = ['banner', 'code', 'mediaBlock', 'gallery', 'pullQuote', 'embed', 'audioPlayer', 'legacyHtml'] as const
export const FEATURED_BLOCK_TYPES = ['mediaBlock', 'gallery', 'embed'] as const

const NODE_TYPES = new Set(['root', 'paragraph', 'heading', 'quote', 'list', 'listitem', 'horizontalrule', 'text', 'linebreak', 'link', 'block'])

/** Problems in converted output: a node the editor does not know, or a block the field would silently drop. */
export function lexicalProblems(state: LexicalState, allowedBlocks: readonly string[] = BODY_BLOCK_TYPES): string[] {
  const problems: string[] = []
  const visit = (n: LexNode, depth: number) => {
    if (!NODE_TYPES.has(n.type)) problems.push(`unknown node type "${n.type}"`)
    if (n.type === 'block') {
      const t = (n.fields as { blockType?: string } | undefined)?.blockType
      if (!t || !allowedBlocks.includes(t)) problems.push(`block type "${t}" is not allowed here`)
    }
    if (n.type === 'link' && !(n.fields as { url?: string } | undefined)?.url) problems.push('link without an address')
    if (depth > 12) problems.push('nesting too deep')
    for (const c of (n.children as LexNode[] | undefined) ?? []) visit(c, depth + 1)
  }
  visit(state.root, 0)
  return problems
}

export function featuredProblems(items: readonly BlockItem[]): string[] {
  const problems: string[] = []
  if (items.length > 1) problems.push('more than one featured item')
  for (const i of items) if (!(FEATURED_BLOCK_TYPES as readonly string[]).includes(i.blockType)) problems.push(`featured block "${i.blockType}" is not allowed`)
  return problems
}
