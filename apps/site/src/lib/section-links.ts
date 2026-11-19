/**
 * Where a link typed into a section may go: a path on this site, a place on the page, an https address, a mail or phone link. Anything
 * else (`javascript:`, `data:`, a bare word) is not a link: the block draws its text without one. A section's link fields are typed by
 * staff, and a block never builds an `href` from a value this has not accepted.
 */
export function safeHref(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (v === '' || /[\s<>"'`\\]/.test(v)) return null
  if (v.startsWith('/') && !v.startsWith('//')) return v
  if (v.startsWith('#') && v.length > 1) return v
  if (/^https:\/\/[^/]+/i.test(v)) return v
  if (/^mailto:[^@\s]+@[^@\s]+$/i.test(v)) return v
  if (/^tel:\+?[0-9().-]{3,}$/i.test(v)) return v
  return null
}

/** Whether a link stays on this site (a path or a place on the page), so a block uses `next/link` and keeps the player playing. */
export function isInternalHref(href: string): boolean {
  return href.startsWith('/') || href.startsWith('#')
}

/** A field validation for a link field: empty is fine; anything else must be a link `safeHref` accepts. */
export function validateHref(value: unknown): true | string {
  if (value === undefined || value === null || value === '') return true
  return safeHref(value) ? true : 'Use a path on this site (/sponsor), a place on the page (#rates), an https address, mailto: or tel:.'
}
