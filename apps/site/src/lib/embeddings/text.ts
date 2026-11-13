import { createHash } from 'node:crypto'

import { EMBEDDING_MODEL, MAX_EMBED_CHARS } from './config'

/**
 * What is embedded for a story, and whether it is embedded at all. Pure.
 *
 * Rules (ROADMAP: Vector search and similar stories):
 *  - Only WUWF's own, published stories. NPR and wire stories are never embedded: they are not ours to archive or to send on.
 *  - A members-only story is embedded from its title, dek and description only, never its body: the body is not public, and a
 *    similarity index must not let the public infer it.
 *  - Text only. Blocks (pictures, embeds, widgets, link lines) are skipped, as in reading time.
 */

export type EmbeddableStory = {
  title?: string | null
  dek?: string | null
  meta?: { description?: string | null } | null
  content?: unknown
  membersOnly?: boolean | null
  source?: string | null
  _status?: string | null
}

/** Why a story is left out, or null when it is eligible. Reasons are for reports, not for users. */
export function skipReason(story: EmbeddableStory): 'not-published' | 'not-wuwf' | 'no-text' | null {
  if (story._status !== 'published') return 'not-published'
  if ((story.source ?? 'wuwf') !== 'wuwf') return 'not-wuwf'
  if (embeddingText(story) === '') return 'no-text'
  return null
}

function collectText(node: unknown, out: string[]): void {
  if (typeof node !== 'object' || node === null) return
  const n = node as { type?: unknown; text?: unknown; children?: unknown }
  if (n.type === 'block') return
  if (typeof n.text === 'string') out.push(n.text)
  if (Array.isArray(n.children)) {
    for (const child of n.children) collectText(child, out)
    // A paragraph break is a space between words, never a join of two words.
    if (n.type === 'paragraph' || n.type === 'heading' || n.type === 'quote' || n.type === 'listitem') out.push('\n')
  }
}

/** The reader-visible text of a Lexical document, one paragraph per line. */
export function lexicalPlainText(state: unknown): string {
  const parts: string[] = []
  collectText((state as { root?: unknown } | null)?.root, parts)
  return parts
    .join('')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()

/** The one string a story is embedded from: title, dek, description, then the body, cut at `MAX_EMBED_CHARS`. */
export function embeddingText(story: EmbeddableStory): string {
  const head = [clean(story.title), clean(story.dek), clean(story.meta?.description)].filter((s) => s !== '')
  const body = story.membersOnly === true ? '' : lexicalPlainText(story.content)
  const text = [...head, body].filter((s) => s !== '').join('\n\n')
  return text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS) : text
}

/** What decides whether a stored vector is stale: the text and the model that read it. A re-save that changes neither costs nothing. */
export function contentHash(text: string, model: string = EMBEDDING_MODEL): string {
  return createHash('sha256').update(`${model}\n${text}`).digest('hex')
}

/** A rough size for a cost estimate: English runs about four characters to a token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
