// Who may add or change preserved (migrated) HTML in a story body. Pure.
//
// Payload does not apply a block's field-level access to blocks nested inside a rich-text field, so "only an
// administrator can write preserved HTML" cannot be left to the field. This compares the body being saved with the
// one already stored and names every preserved-HTML block that is new or different; a collection hook refuses the
// save for anyone who is not allowed. A person who merely re-saves a story keeps the blocks that are already there.
//
// The walk visits every object and array in the value it is given, not only a rich-text field's own `root`, so the same check covers a
// rich-text state nested in a block field (a page's `sections`: the Text block's body) and one nested in a block inside rich text. A
// section moved, or its siblings reordered, changes no block's id, so it is not a change.

type Node = { type?: unknown; fields?: { id?: unknown; blockType?: unknown; html?: unknown }; children?: unknown }

/** Calls `visit` on every object found anywhere in a JSON value (depth-limited, so a malformed value cannot run away). */
function walkJson(value: unknown, visit: (node: Record<string, unknown>) => void, depth = 0): void {
  if (typeof value !== 'object' || value === null || depth > 64) return
  if (Array.isArray(value)) {
    for (const v of value) walkJson(v, visit, depth + 1)
    return
  }
  const node = value as Record<string, unknown>
  visit(node)
  for (const v of Object.values(node)) walkJson(v, visit, depth + 1)
}

/** block id → its html, for every preserved-HTML block anywhere in a Lexical state, or in a value that holds one. */
export function collectLegacyHtml(state: unknown): Map<string, string> {
  const found = new Map<string, string>()
  walkJson(state, (node) => {
    const n = node as Node
    if (n.type === 'block' && n.fields?.blockType === 'legacyHtml') {
      found.set(typeof n.fields.id === 'string' ? n.fields.id : `anon-${found.size}`, typeof n.fields.html === 'string' ? n.fields.html : '')
    }
  })
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

/** block id → what the widget runs, for every script widget anywhere in a Lexical state, or in a value that holds one. */
export function collectWidgets(state: unknown): Map<string, string> {
  const found = new Map<string, string>()
  walkJson(state, (node) => {
    const n = node as { type?: unknown; fields?: WidgetFields }
    if (n.type === 'block' && n.fields?.blockType === 'widget') {
      found.set(typeof n.fields.id === 'string' ? n.fields.id : `anon-${found.size}`, fingerprint(n.fields))
    }
  })
  return found
}

/** Ids of widgets in `next` that are new, or whose script or settings differ from `previous`. */
export function changedWidgets(next: unknown, previous: unknown): string[] {
  const before = collectWidgets(previous)
  return [...collectWidgets(next)].filter(([id, f]) => before.get(id) !== f).map(([id]) => id)
}
