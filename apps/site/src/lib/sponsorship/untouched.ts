// Whether a sponsor page has been edited by someone since the migrations made it. Pure, so the rule is tested.
//
// The migrations leave a page with three versions: the one `sponsor_pages` made and the two polishing ones. Opening a page in the admin makes an
// autosave draft that holds the same content, so a version count alone cannot tell "someone opened it" from "someone changed it". A page is
// untouched when it has at most three versions that are not autosaves, and every autosave draft holds exactly the published sections.

export interface PageVersionRow {
  autosave?: boolean | null
  sections?: unknown
}

/**
 * A section list as comparable text, without any `id`: the Local API gives an array row that has no stored id a new random one each time it
 * reads it, so two reads of the same content differ by id alone.
 */
const content = (sections: unknown): string => JSON.stringify(sections ?? null, (key, value) => (key === 'id' ? undefined : value))

/** `published` is the page's own `sections`; `versions` are its version rows (their `version.sections`). */
export function pageIsUntouched(versions: readonly PageVersionRow[], published: unknown, madeByMigrations = 3): boolean {
  const saved = versions.filter((v) => !v.autosave)
  if (saved.length > madeByMigrations) return false
  const same = content(published)
  return versions.filter((v) => v.autosave).every((v) => content(v.sections) === same)
}
