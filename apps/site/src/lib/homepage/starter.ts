// The news sections a new home page starts with: the three the station leads with, for each that exists. Pure. Only ever used to fill an
// EMPTY list (an editor's choice is never replaced), by the seeding script and nothing at runtime: the page itself reads only what is stored.

export const STARTER_SECTIONS = [
  { slug: 'local-news', heading: 'Local News' },
  { slug: 'music-arts', heading: 'Music & Arts' },
  { slug: 'florida-news', heading: 'Florida News' },
] as const

export interface StarterModule {
  heading: string
  section: string | number
  count: number
  enabled: true
}

/** The modules to write: the starter sections that exist, in order, or none when the home page already has any. */
export function starterModules(sections: readonly { id: string | number; slug: string }[], current: readonly unknown[] | null | undefined): StarterModule[] {
  if ((current?.length ?? 0) > 0) return []
  const bySlug = new Map(sections.map((s) => [s.slug, s.id]))
  return STARTER_SECTIONS.flatMap((s) => {
    const id = bySlug.get(s.slug)
    return id === undefined ? [] : [{ heading: s.heading, section: id, count: 5, enabled: true as const }]
  })
}
