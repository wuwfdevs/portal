/**
 * Processes media resource URL to ensure proper formatting
 * @param url The original URL from the resource
 * @param cacheTag Optional cache tag to append to the URL
 * @returns Properly formatted URL with cache tag if provided
 *
 * Local paths (e.g. `/api/media/file/image.webp`) are kept relative so
 * Next.js image optimization treats them as local rather than fetching
 * through `remotePatterns`, which blocks private IPs since Next.js 16.
 *
 * A file's address from the CMS already carries a query when the file lives in cloud storage
 * (`/api/media/file/a.jpg?prefix=media`: the folder is part of the address). The cache tag is then one more parameter,
 * joined with `&`. A second `?` would fold the tag into the `prefix` value and the file route would refuse the request.
 * A `#fragment`, if there is one, stays at the very end.
 */
export const getMediaUrl = (url: string | null | undefined, cacheTag?: string | null): string => {
  if (!url) return ''
  if (!cacheTag) return url

  const tag = encodeURIComponent(cacheTag)
  const hash = url.indexOf('#')
  const base = hash === -1 ? url : url.slice(0, hash)
  const fragment = hash === -1 ? '' : url.slice(hash)
  return `${base}${base.includes('?') ? '&' : '?'}${tag}${fragment}`
}
