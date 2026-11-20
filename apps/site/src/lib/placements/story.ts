// How a story page carries its zones. Pure.
//
// The story's zone (`story.inline`) is drawn by the story template, never placed by an editor in a story, so a sponsor message is never typed into a
// story and one story's layout cannot differ from another's. This holds the two decisions the template makes: which page a story is, for a placement aimed at
// sections, topics or reporters, and where in the body the inline band goes.

import type { PageContext } from './resolve'

type Ref = string | number | { id: string | number } | null | undefined
const idOf = (r: Ref): string | number | null => (r == null ? null : typeof r === 'object' ? r.id : r)

/** The page a story is, for aiming: its section, its topics and its reporters. */
export function storyPage(story: { section?: Ref; categories?: readonly Ref[] | null; contributors?: readonly Ref[] | null }): Extract<PageContext, { page: 'story' }> {
  const many = (list: readonly Ref[] | null | undefined) => (list ?? []).map(idOf).filter((v): v is string | number => v !== null)
  return { page: 'story', sectionId: idOf(story.section), topicIds: many(story.categories), personIds: many(story.contributors) }
}

/**
 * Where the inline bands go in a story's body: the first after the fourth paragraph with words, in a story of at least six; the second after the twelfth, in a story of at least
 * sixteen. A second place is sold only where the page is long, so a short story never carries two and a long one is never one band for its whole length. A band is drawn only
 * when a placement runs for its place (`story.inline` holds two).
 */
export const INLINE_POSITIONS = [
  { after: 4, minParagraphs: 6 },
  { after: 12, minParagraphs: 16 },
] as const

interface LexicalNode {
  type?: string
  text?: string
  children?: LexicalNode[]
}

const hasWords = (node: LexicalNode): boolean => {
  if (typeof node.text === 'string' && node.text.trim() !== '') return true
  return Array.isArray(node.children) && node.children.some(hasWords)
}

/**
 * Splits a story's body for its inline bands: `bands` is how many placements run (at most two). Only paragraphs with words count (an image or an embed does not). Returns the body
 * as Lexical states with the same settings, one more than the bands that fit (the bands go between them), or null when no band fits (the story is too short, has no band to
 * draw, or is not a Lexical document).
 */
export function splitForBands<S extends { root?: { children?: unknown[] } & Record<string, unknown> }>(content: S | null | undefined, bands: number): S[] | null {
  const children = content?.root?.children as LexicalNode[] | undefined
  if (!content?.root || !Array.isArray(children) || bands < 1) return null
  const paragraphs = children.map((c, i) => ({ c, i })).filter(({ c }) => c.type === 'paragraph' && hasWords(c))
  const cuts: number[] = []
  for (const position of INLINE_POSITIONS.slice(0, Math.min(2, Math.floor(bands)))) {
    if (paragraphs.length < Math.max(position.minParagraphs, position.after + 1)) break
    cuts.push(paragraphs[position.after - 1]!.i + 1)
  }
  if (cuts.length === 0) return null
  const root = content.root
  const bounds = [0, ...cuts, children.length]
  return bounds.slice(0, -1).map((from, k) => ({ ...content, root: { ...root, children: children.slice(from, bounds[k + 1]) } }))
}
