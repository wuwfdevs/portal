// Pure slug helpers. Payload's own slug field fills a slug in a beforeChange hook, which runs after the
// `required` check, so anything created without the admin UI's client-side fill (the Portal's publish
// endpoint, imports, tests) is rejected. These run earlier, in beforeValidate.

const MAX_SLUG_LENGTH = 80

/** "Growth & Development: Pensacola’s 2026!" → "growth-and-development-pensacolas-2026" */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents: é → e
    .replace(/[’'`]/g, '') // apostrophes vanish rather than splitting a word
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '')
}

/** `base`, then `base-2`, `base-3`… the first one `isTaken` says is free. Bounded, so a bad `isTaken` cannot loop forever. */
export async function uniqueSlug(base: string, isTaken: (slug: string) => Promise<boolean>, limit = 100): Promise<string> {
  const root = base || 'untitled'
  if (!(await isTaken(root))) return root
  for (let n = 2; n <= limit; n += 1) {
    const candidate = `${root.slice(0, MAX_SLUG_LENGTH - String(n).length - 1)}-${n}`
    if (!(await isTaken(candidate))) return candidate
  }
  throw new Error(`No free slug found for "${root}"`)
}
