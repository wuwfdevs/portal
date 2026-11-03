// The address of one update inside its blog: `/live-updates/<blog>#<anchor>`. An anchor is a short slug of the headline, kept
// for good once set (a link someone shared must keep working), and unique within its blog. Pure.

const MAX = 60

export function slugifyAnchor(headline: string): string {
  const s = headline
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX)
    .replace(/-+$/, '')
  return s || 'update'
}

/** The first anchor from `headline` that `taken` does not already hold: `x`, then `x-2`, `x-3`, ... */
export function uniqueAnchor(headline: string, taken: ReadonlySet<string>): string {
  const base = slugifyAnchor(headline)
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base.slice(0, MAX - String(n).length - 1)}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

/** Whether a stored anchor is acceptable (a legacy one may be longer than a new one, so the limit here is lenient). */
export const isValidAnchor = (a: string): boolean => /^[a-z0-9][a-z0-9-]{0,199}$/.test(a)
