// Reading time from a Lexical document. Pure. Only the words a reader sees count: text nodes, however deeply
// nested; embedded blocks (images, code, calls to action) are not counted as reading.

const WORDS_PER_MINUTE = 200

function collectText(node: unknown, out: string[]): void {
  if (typeof node !== 'object' || node === null) return
  const n = node as { type?: unknown; text?: unknown; children?: unknown }
  if (n.type === 'block') return
  if (typeof n.text === 'string') out.push(n.text)
  if (Array.isArray(n.children)) for (const child of n.children) collectText(child, out)
}

export function lexicalWordCount(state: unknown): number {
  const parts: string[] = []
  collectText((state as { root?: unknown } | null)?.root, parts)
  const words = parts.join(' ').match(/\S+/g)
  return words ? words.length : 0
}

/** Whole minutes, at least 1 for any text, 0 for none. */
export function readingMinutes(state: unknown): number {
  const words = lexicalWordCount(state)
  return words === 0 ? 0 : Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}
