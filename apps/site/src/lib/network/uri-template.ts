/**
 * Just enough of RFC 6570 for CDS image templates (`hrefTemplate`): the docs allow only `width`, `quality` and `format`, and say to use a
 * template parser, not find-and-replace. Supported: `{var}`, `{+var}`, `{?a,b}` and `{&a,b}`. Anything else in braces is left out of the result
 * rather than guessed at. Pure.
 */

type Vars = Record<string, string | number | undefined>

const unreserved = (value: string): string => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const reservedAllowed = (value: string): string => encodeURI(value)

export function expandUriTemplate(template: string, vars: Vars): string {
  return template.replace(/\{([^}]*)\}/g, (_match, expression: string) => {
    const operator = /^[+?&]/.test(expression) ? expression[0] : ''
    const names = (operator ? expression.slice(1) : expression).split(',').map((n) => n.trim()).filter(Boolean)
    const defined = names.filter((n) => vars[n] !== undefined && vars[n] !== null && String(vars[n]) !== '')

    if (operator === '?' || operator === '&') {
      if (defined.length === 0) return ''
      return (operator === '?' ? '?' : '&') + defined.map((n) => `${unreserved(n)}=${unreserved(String(vars[n]))}`).join('&')
    }
    const encode = operator === '+' ? reservedAllowed : unreserved
    return defined.map((n) => encode(String(vars[n]))).join(',')
  })
}

/** The fixed set CDS allows on an image template. */
export type ImageSize = { width?: number; quality?: number; format?: 'jpeg' | 'png' | 'webp' }

/**
 * An image's address at a size: the template expanded when there is one, else the plain `href`. The docs say to fall back to `href` when
 * a template is missing or the built address does not answer; the caller does the second part.
 */
export function expandImageUrl(image: { href: string; hrefTemplate: string | null }, size: ImageSize): string {
  if (!image.hrefTemplate) return image.href
  const built = expandUriTemplate(image.hrefTemplate, { width: size.width, quality: size.quality, format: size.format })
  try {
    return new URL(built).protocol === 'https:' ? built : image.href
  } catch {
    return image.href
  }
}
