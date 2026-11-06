/** The pages a themed show has under its own address (phase 7a). Saving the show, an episode, a Field Note or an archive item refreshes them all. */
export const SHOW_SUBPAGES = ['field-notes', 'archive', 'support'] as const
export type ShowSubpage = (typeof SHOW_SUBPAGES)[number]

/** The show's own page and each of its sub-pages. */
export function showPagePaths(showPath: string): string[] {
  return [showPath, ...SHOW_SUBPAGES.map((s) => `${showPath}/${s}`)]
}

/** Splits `/shows/x/archive` into the show's address and the sub-page, or null when the path does not end in one. */
export function parseShowSubpage(path: string): { showPath: string; subpage: ShowSubpage } | null {
  const i = path.lastIndexOf('/')
  if (i <= 0) return null
  const last = path.slice(i + 1)
  return (SHOW_SUBPAGES as readonly string[]).includes(last) ? { showPath: path.slice(0, i), subpage: last as ShowSubpage } : null
}
