/**
 * The header's settings, read safely (board 27). Pure: the Header global in, what to draw out. Anything missing or
 * malformed falls back to a working header, never to an empty one or a broken link.
 */

type Action = { show?: boolean | null; label?: string | null } | null | undefined
type HeaderActions = { listen?: Action; search?: Action; signIn?: Action; donate?: (Action & { href?: string | null }) | null } | null | undefined

export type HeaderButtons = {
  listen: { label: string } | null
  search: { label: string } | null
  signIn: { label: string } | null
  donate: { label: string; href: string } | null
}

const DEFAULT_DONATE_HREF = '/support'

/** A site path ("/support") or a full https address. No other scheme, and no protocol-relative "//host". */
export function isHeaderHref(value: string): boolean {
  if (value.startsWith('/')) return !value.startsWith('//')
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function validateHeaderHref(value: string | null | undefined): true | string {
  if (!value) return true
  return isHeaderHref(value.trim()) ? true : 'Use a page on this site ("/support") or a full https:// address.'
}

const shown = (action: Action) => action?.show !== false
const label = (action: Action, fallback: string) => action?.label?.trim() || fallback

/**
 * Which buttons sit on the right, with their words. Sign in needs audience sign-in to be configured as well, and Listen
 * live needs at least one live channel: a button to a player that is not there would do nothing.
 */
export function headerButtons(actions: HeaderActions, signInAvailable: boolean, listenAvailable = false): HeaderButtons {
  const href = actions?.donate?.href?.trim()
  return {
    listen: listenAvailable && shown(actions?.listen) ? { label: label(actions?.listen, 'Listen live') } : null,
    search: shown(actions?.search) ? { label: label(actions?.search, 'Search') } : null,
    signIn: signInAvailable && shown(actions?.signIn) ? { label: label(actions?.signIn, 'Sign in') } : null,
    donate: shown(actions?.donate)
      ? { label: label(actions?.donate, 'Donate'), href: href && isHeaderHref(href) ? href : DEFAULT_DONATE_HREF }
      : null,
  }
}

type Item = { kind?: string | null; label?: string | null; links?: unknown[] | null; link?: { label?: string | null } | null }

/** Only items that can be drawn: a menu with a label and at least one link, or a link with a label. */
export function drawableItems<T extends Item>(items: T[] | null | undefined): T[] {
  return (items ?? []).filter((item) =>
    item.kind === 'menu' ? Boolean(item.label?.trim()) && (item.links?.length ?? 0) > 0 : Boolean(item.link?.label?.trim()),
  )
}
