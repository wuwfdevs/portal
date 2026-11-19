/** An anchor is lower-case words joined by hyphens: it becomes the `id` of the section and the `#fragment` of a link to it. */
export const ANCHOR_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidAnchor(value: unknown): boolean {
  return typeof value === 'string' && ANCHOR_PATTERN.test(value)
}

/**
 * The anchors used by more than one section of a page. Payload's `unique` applies across a whole collection, so uniqueness inside one
 * page is checked here, by a validation on the blocks field. Empty anchors are ignored (an anchor is optional).
 */
export function duplicateAnchors(rows: ReadonlyArray<{ anchor?: unknown } | null | undefined> | null | undefined): string[] {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const row of rows ?? []) {
    const a = typeof row?.anchor === 'string' ? row.anchor.trim() : ''
    if (!a) continue
    if (seen.has(a)) dupes.add(a)
    seen.add(a)
  }
  return [...dupes]
}
