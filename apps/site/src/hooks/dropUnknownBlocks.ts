import type { FieldHook } from 'payload'

/**
 * A blocks field stored as JSON (`blocksAsJSON`) keeps whatever rows it is given, including a block type the field does not offer.
 * Stored relationally, such a row had no table and was silently dropped, and code written then relies on that (the importers build only
 * the allowed types; a test pins that a story's featured media drops a pull quote). This restores it for a field whose set of types is
 * fixed: rows of any other `blockType` are removed before the value is stored.
 *
 * Not for the pages' `sections` field: there an unknown type is a block that was removed from the library or a set, and it is kept in the
 * data (and drawn as nothing) so a mistake can be undone from a version; `filterOptions` rejects it when the page is published.
 */
export function keepOnlyBlockTypes(allowed: readonly string[]): FieldHook {
  const set = new Set(allowed)
  return ({ value }) => (Array.isArray(value) ? value.filter((row) => row && typeof row === 'object' && set.has((row as { blockType?: string }).blockType ?? '')) : value)
}
