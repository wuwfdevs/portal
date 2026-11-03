// Who may add or change preserved (migrated) HTML in a story body. Pure.
//
// Payload does not apply a block's field-level access to blocks nested inside a rich-text field, so "only an
// administrator can write preserved HTML" cannot be left to the field. This compares the body being saved with the
// one already stored and names every preserved-HTML block that is new or different; a collection hook refuses the
// save for anyone who is not allowed. A person who merely re-saves a story keeps the blocks that are already there.

type Node = { type?: unknown; fields?: { id?: unknown; blockType?: unknown; html?: unknown }; children?: unknown }

/** block id → its html, for every preserved-HTML block anywhere in a Lexical state. */
export function collectLegacyHtml(state: unknown): Map<string, string> {
  const found = new Map<string, string>()
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return
    const n = node as Node
    if (n.type === 'block' && n.fields?.blockType === 'legacyHtml') {
      found.set(typeof n.fields.id === 'string' ? n.fields.id : `anon-${found.size}`, typeof n.fields.html === 'string' ? n.fields.html : '')
    }
    if (Array.isArray(n.children)) n.children.forEach(walk)
  }
  walk((state as { root?: unknown } | null | undefined)?.root)
  return found
}

/** Ids of preserved-HTML blocks in `next` that are not, byte for byte, in `previous`. */
export function changedLegacyHtml(next: unknown, previous: unknown): string[] {
  const before = collectLegacyHtml(previous)
  return [...collectLegacyHtml(next)].filter(([id, html]) => before.get(id) !== html).map(([id]) => id)
}
