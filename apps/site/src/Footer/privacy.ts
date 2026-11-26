import type { Footer } from '@/payload-types'

type LegalItem = NonNullable<Footer['navItems']>[number]

/**
 * The privacy notice's address, for the consent banner's "How we measure visits": the footer's legal link whose label names privacy, resolved
 * the way `CMSLink` resolves it. Null when the footer has none (the banner then draws no link). Pure.
 */
export function privacyHrefOf(items: readonly LegalItem[] | null | undefined): string | null {
  for (const item of items ?? []) {
    const link = item?.link
    if (!link || !/privacy/i.test(link.label ?? '')) continue
    const ref = link.reference
    if (link.type === 'reference' && ref && typeof ref.value === 'object' && ref.value?.slug) {
      return `${ref.relationTo !== 'pages' ? `/${ref.relationTo}` : ''}/${ref.value.slug}`
    }
    if (typeof link.url === 'string' && link.url.trim()) return link.url.trim()
  }
  return null
}
