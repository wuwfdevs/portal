// How a story page carries its zones. Pure.
//
// The story's zones (`story.rail`, `story.inline`) are drawn by the story template, never placed by an editor in a story, so a sponsor message is never typed into a
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

/** The opening paragraphs a reader gets before the inline band, and how long a story must be for it to carry one. */
export const INLINE_AFTER = 4
export const INLINE_MIN_PARAGRAPHS = 6

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
 * Splits a story's body after its fourth paragraph, for the inline band. Only paragraphs with words count (an image or an embed does not), and only a story of at
 * least six of them is split, so the band is never one paragraph from the end. Returns the two halves as Lexical states with the same settings, or null when the
 * story is too short (or not a Lexical document): then it has no inline band.
 */
export function splitBody<S extends { root?: { children?: unknown[] } & Record<string, unknown> }>(content: S | null | undefined, after = INLINE_AFTER, minParagraphs = INLINE_MIN_PARAGRAPHS): { head: S; tail: S } | null {
  const children = content?.root?.children as LexicalNode[] | undefined
  if (!content?.root || !Array.isArray(children)) return null
  const paragraphs = children.map((c, i) => ({ c, i })).filter(({ c }) => c.type === 'paragraph' && hasWords(c))
  if (paragraphs.length < Math.max(minParagraphs, after + 1)) return null
  const cut = paragraphs[after - 1]!.i + 1
  const root = content.root
  return {
    head: { ...content, root: { ...root, children: children.slice(0, cut) } },
    tail: { ...content, root: { ...root, children: children.slice(cut) } },
  }
}
