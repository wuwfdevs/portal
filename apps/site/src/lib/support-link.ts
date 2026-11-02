// Where a button on the giving page may point. Staff type these into the admin, so they are checked on the way in
// (the field validator) and again when rendered (a value that predates the rule, or came from an import, still
// cannot become a `javascript:` link).

/** A relative path on this site, a secure web address, or an email link. Nothing else. */
export function isAllowedSupportHref(value: string): boolean {
  const href = value.trim()
  if (!href || /\s/.test(href)) return false
  if (href.startsWith('/')) return !href.startsWith('//') && !href.includes('\\')
  if (/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(href)) return true
  try {
    const url = new URL(href)
    return url.protocol === 'https:' && url.hostname.includes('.')
  } catch {
    return false
  }
}

/** The href to render, or null when there is nothing safe to link to. */
export function supportHref(value: string | null | undefined): string | null {
  if (!value) return null
  return isAllowedSupportHref(value) ? value.trim() : null
}

/** Payload field validator: empty is fine (the button is then simply not shown). */
export const validateSupportHref = (value: string | null | undefined): true | string => {
  if (value === undefined || value === null || value.trim() === '') return true
  return isAllowedSupportHref(value)
    ? true
    : 'Use a page on this site (starting with /), a secure https:// address, or a mailto: address.'
}
