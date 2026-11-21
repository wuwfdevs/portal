import { safeHref } from '@/lib/section-links'

/**
 * The site banner: one message an editor puts above the page, on the home page or on every page. It began as the home page's "emergency
 * coverage" notice and is the same thing with a choice of where and how loud. The settings are the Site banner global (`site-banner`); this
 * is the pure part, so the rules are tested without a database or a page.
 */

export const BANNER_SCOPES = ['home', 'all'] as const
export type BannerScope = (typeof BANNER_SCOPES)[number]

export const BANNER_STYLES = ['emergency', 'notice'] as const
export type BannerStyle = (typeof BANNER_STYLES)[number]

/** The small label above the headline when the editor leaves it empty. */
export const DEFAULT_LABELS: Record<BannerStyle, string> = { emergency: 'Emergency coverage', notice: 'Notice' }

export interface BannerData {
  scope: BannerScope
  style: BannerStyle
  label: string
  headline: string
  body: string | null
  linkLabel: string | null
  /** An address `safeHref` accepted; a stored value that is not one is dropped, so a link is never built from it. */
  linkHref: string | null
}

/** The stored fields (the Site banner global), as the generated type has them. */
export interface BannerFields {
  active?: boolean | null
  scope?: string | null
  style?: string | null
  label?: string | null
  headline?: string | null
  body?: string | null
  linkLabel?: string | null
  linkHref?: string | null
}

const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T => (values.includes(value as T) ? (value as T) : fallback)
const text = (value: string | null | undefined): string | null => value?.trim() || null

/**
 * The banner to show, or null. It shows only while switched on and with a headline. An unknown scope falls back to the home page and an
 * unknown style to the emergency look (the first things an editor could choose), and a link with no words or no safe address is left out.
 */
export function bannerOf(fields: BannerFields | null | undefined): BannerData | null {
  const headline = text(fields?.headline)
  if (!fields?.active || !headline) return null
  const style = oneOf(BANNER_STYLES, fields.style, 'emergency')
  const linkLabel = text(fields.linkLabel)
  const linkHref = safeHref(fields.linkHref)
  return {
    scope: oneOf(BANNER_SCOPES, fields.scope, 'home'),
    style,
    label: text(fields.label) ?? DEFAULT_LABELS[style],
    headline,
    body: text(fields.body),
    linkLabel: linkHref ? (linkLabel ?? 'Read more') : null,
    linkHref,
  }
}

/** Where a banner is drawn: the home page draws its own (inside the page), every other page by the layout. `all` is drawn once, by the layout. */
export function bannerFor(banner: BannerData | null, place: 'home-page' | 'layout'): BannerData | null {
  if (!banner) return null
  return place === 'layout' ? (banner.scope === 'all' ? banner : null) : banner.scope === 'home' ? banner : null
}
