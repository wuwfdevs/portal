// The one rule for where a link line (a short label and a link, set apart from the text) may point. The editor's field
// validator, the page and the Grove converter all use it, so the converter can never build a line that the editor then
// refuses to save.

/** A path on this site, an http or https address, or an email link. Nothing else (never `javascript:` or a data address). */
export function isLinkLineUrl(value: string | null | undefined): boolean {
  const href = (value ?? '').trim()
  if (!href || /\s/.test(href)) return false
  if (href.startsWith('/')) return !href.startsWith('//') && !href.includes('\\')
  if (/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(href)) return true
  try {
    const url = new URL(href)
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.')
  } catch {
    return false
  }
}

/** The address to render, or null when there is nothing safe to link to. */
export function linkLineHref(value: string | null | undefined): string | null {
  return isLinkLineUrl(value) ? (value as string).trim() : null
}

export const LINK_LINE_URL_MESSAGE = 'Use a page on this site (starting with /), an https:// or http:// address, or mailto:.'
