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

// The same question for script widgets: which site's code a reader runs is decided by `scriptUrl` and the settings
// handed to it, so a change to any of those needs a publisher. A new title, caption or height does not.

type WidgetFields = { id?: unknown; blockType?: unknown; scriptUrl?: unknown; module?: unknown; elementId?: unknown; initEvent?: unknown; attributes?: unknown }

const fingerprint = (f: WidgetFields): string => {
  const attrs = Array.isArray(f.attributes) ? (f.attributes as { name?: unknown; value?: unknown }[]).map((a) => [a?.name ?? '', a?.value ?? '']) : []
  return JSON.stringify([f.scriptUrl ?? '', Boolean(f.module), f.elementId ?? '', f.initEvent ?? '', attrs])
}

/** block id → what the widget runs, for every script widget anywhere in a Lexical state. */
export function collectWidgets(state: unknown): Map<string, string> {
  const found = new Map<string, string>()
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return
    const n = node as { type?: unknown; fields?: WidgetFields; children?: unknown }
    if (n.type === 'block' && n.fields?.blockType === 'widget') {
      found.set(typeof n.fields.id === 'string' ? n.fields.id : `anon-${found.size}`, fingerprint(n.fields))
    }
    if (Array.isArray(n.children)) n.children.forEach(walk)
  }
  walk((state as { root?: unknown } | null | undefined)?.root)
  return found
}

/** Ids of widgets in `next` that are new, or whose script or settings differ from `previous`. */
export function changedWidgets(next: unknown, previous: unknown): string[] {
  const before = collectWidgets(previous)
  return [...collectWidgets(next)].filter(([id, f]) => before.get(id) !== f).map(([id]) => id)
}
