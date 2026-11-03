// Deciding whether the body of a story that is already imported should be replaced by what the converter makes of its Grove page
// today. Pure: it looks at two bodies and says what it sees. Reading and writing the database is the script's job
// (`scripts/grove/repair-bodies-core.ts`).
//
// The rule is to change as little as possible, and to be able to prove it changed nothing the reader sees:
//   - a body needs repair only if it still holds markup typed as words, or the page now has "Related" / "Support" lines that the
//     stored body has as plain paragraphs;
//   - the words a reader would read must be identical before and after (case, punctuation, spacing and tags aside);
//   - whether an editor has touched the story since the import is the script's question (it asks the version history).

import { isTypedMarkup } from './html'
import type { LexNode } from './types'

type Node = { type?: string; text?: unknown; fields?: Record<string, unknown>; children?: Node[] }

const walk = (root: unknown, visit: (n: Node) => void) => {
  const go = (n: Node) => {
    visit(n)
    for (const c of n.children ?? []) go(c)
  }
  const r = (root as { root?: Node } | null | undefined)?.root
  if (r) go(r)
}

/** How many link-line blocks a body holds. */
export function countLinkLines(content: unknown): number {
  let n = 0
  walk(content, (x) => {
    if (x.type === 'block' && x.fields?.blockType === 'linkLine') n++
  })
  return n
}

/** How many pieces of text still carry markup typed as words (what the converter now reads back as formatting). */
export function countTypedMarkup(content: unknown): number {
  let n = 0
  walk(content, (x) => {
    if (x.type === 'text' && typeof x.text === 'string' && isTypedMarkup(x.text)) n++
  })
  return n
}

/**
 * The fields where the converter puts words a reader reads, in blocks other than a link line: a pull quote's text and
 * attribution, a picture's caption, credit and source, a gallery's titles and captions, an audio or video title, a preserved
 * table's HTML. (Other fields hold identifiers, addresses and settings, which are not read.)
 */
const BLOCK_TEXT_KEYS = new Set(['text', 'attribution', 'caption', 'credit', 'source', 'altText', 'title', 'description', 'html', 'note'])

function collectBlockText(value: unknown, out: string[]): void {
  if (Array.isArray(value)) for (const v of value) collectBlockText(v, out)
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'string') {
        if (BLOCK_TEXT_KEYS.has(k)) out.push(v)
      } else collectBlockText(v, out)
    }
}

const decode = (t: string): string => t.replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')

/**
 * The words a reader would read, as lower-case letters and digits only: the text of the body, the label and words of every
 * link line, and the readable fields of every other block (a pull quote, a caption, a title), with typed tags and entities removed first. Two bodies with the same value read the same.
 */
export function visibleWords(content: unknown): string {
  const parts: string[] = []
  walk(content, (x) => {
    if (x.type === 'text' && typeof x.text === 'string') parts.push(x.text)
    else if (x.type === 'block' && x.fields?.blockType === 'linkLine') {
      if (typeof x.fields.label === 'string') parts.push(x.fields.label)
      if (typeof x.fields.linkText === 'string') parts.push(x.fields.linkText)
    } else if (x.type === 'block') collectBlockText(x.fields, parts)
  })
  return decode(parts.join(' ')).replace(/<\/?[a-zA-Z][^>]*>/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

export type RepairPlan =
  | { kind: 'same' }
  | { kind: 'words-differ' }
  | { kind: 'repair'; linkLinesAdded: number; typedMarkupPieces: number }

/** What to do with a stored body, given the body the converter makes today. */
export function planRepair(stored: unknown, fresh: LexNode | unknown): RepairPlan {
  const linkLinesAdded = Math.max(0, countLinkLines(fresh) - countLinkLines(stored))
  const typedMarkupPieces = countTypedMarkup(stored)
  if (linkLinesAdded === 0 && typedMarkupPieces === 0) return { kind: 'same' }
  if (visibleWords(stored) !== visibleWords(fresh)) return { kind: 'words-differ' }
  return { kind: 'repair', linkLinesAdded, typedMarkupPieces }
}

/** Whether the version history says an editor has worked on the story since the importer made it. */
export function editedSinceImport(input: { versionCount: number; createdAt: string; updatedAt: string }, toleranceMinutes = 10): boolean {
  if (input.versionCount > 1) return true
  const gap = new Date(input.updatedAt).getTime() - new Date(input.createdAt).getTime()
  return Number.isFinite(gap) && gap > toleranceMinutes * 60_000
}
