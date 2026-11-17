// Which "other way to give" the page shows, and the details a donor hands to a broker. Pure.

export type WayGroup = { key: string; label: string; best: string; effort: string }
export type WayPanel = { slug: string; group: string; tabLabel: string }

export type WaySelection<P extends WayPanel> = {
  /** The group (tab) that is open. */
  group: string
  /** The panel that is open. */
  panel: P
  /** The panels of that group, for the second row of choices when there is more than one. */
  siblings: P[]
}

/**
 * The panel a visitor asked for with `?way=`: a panel's own name first (`ira`), then a group's (`assets` opens its first panel),
 * and otherwise the first one. Null only when the admin holds no panels at all. A name that matches nothing is ignored, never an error.
 */
export function selectWay<P extends WayPanel>(panels: readonly P[], groups: readonly WayGroup[], requested: string | null | undefined): WaySelection<P> | null {
  const usable = panels.filter((p) => p.slug && p.group)
  if (usable.length === 0) return null
  const want = (requested ?? '').trim().toLowerCase()
  const byPanel = usable.find((p) => p.slug.toLowerCase() === want)
  const byGroup = usable.find((p) => p.group.toLowerCase() === want)
  const order = groups.map((g) => g.key)
  const fallback = [...usable].sort((a, b) => (order.indexOf(a.group) + 1 || 99) - (order.indexOf(b.group) + 1 || 99))[0]!
  const panel = byPanel ?? byGroup ?? fallback
  return { group: panel.group, panel, siblings: usable.filter((p) => p.group === panel.group) }
}

/** The address of the choice for a group: its first panel, so a tab is one plain link. */
export function groupTarget(panels: readonly WayPanel[], group: string): string | null {
  return panels.find((p) => p.group === group && p.slug)?.slug ?? null
}

/** Rows as plain text for the clipboard: one "Label: value" line each, as a broker or fund would want to paste it. */
export const detailsText = (rows: readonly { label?: string | null; value?: string | null }[]): string =>
  rows
    .filter((r) => r.label?.trim() && r.value?.trim())
    .map((r) => `${r.label!.trim()}: ${r.value!.trim()}`)
    .join('\n')
