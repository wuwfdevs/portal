/** An anchor is lower-case words joined by hyphens: it becomes the `id` of the section and the `#fragment` of a link to it. */
export const ANCHOR_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidAnchor(value: unknown): boolean {
  return typeof value === 'string' && ANCHOR_PATTERN.test(value)
}

/**
 * The anchors used by more than one section of a page. Payload's `unique` applies across a whole collection, so uniqueness inside one
 * page is checked here, by a validation on the blocks field. Empty anchors are ignored (an anchor is optional).
 */
type AnchorRow = { anchor?: unknown; columns?: ReadonlyArray<{ sections?: ReadonlyArray<AnchorRow | null | undefined> | null } | null | undefined> | null } | null | undefined

/** A page's sections and the sections its Columns blocks hold, in reading order: an anchor is unique across all of them. */
function withNested(rows: ReadonlyArray<AnchorRow> | null | undefined): Array<{ anchor?: unknown }> {
  const out: Array<{ anchor?: unknown }> = []
  for (const row of rows ?? []) {
    if (!row) continue
    out.push(row)
    for (const col of row.columns ?? []) out.push(...withNested(col?.sections))
  }
  return out
}

export function duplicateAnchors(rows: ReadonlyArray<AnchorRow> | null | undefined): string[] {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const row of withNested(rows)) {
    const a = typeof row?.anchor === 'string' ? row.anchor.trim() : ''
    if (!a) continue
    if (seen.has(a)) dupes.add(a)
    seen.add(a)
  }
  return [...dupes]
}
