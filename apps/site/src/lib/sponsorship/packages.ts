// New-sponsor packages and the Carpool Plan, read from the Sponsorship settings. Pure.

import { formatMoney } from './money'
import { toCents } from './rates'

type Packages = { items?: Array<{ id?: string | null; name?: string | null; description?: string | null; price?: number | null; value?: number | null }> | null }

export type PackageView = { key: string; number: number; name: string; description: string; price: string; priceCents: number; valueLine: string }

/** Packages with a name and a price; "You save" is the difference from the value and is left out when there is none. */
export function packageViews(packages: Packages | null | undefined): PackageView[] {
  const out: PackageView[] = []
  for (const [i, p] of (packages?.items ?? []).entries()) {
    const name = p.name?.trim()
    if (!name || typeof p.price !== 'number') continue
    const price = toCents(p.price)
    const value = toCents(p.value)
    out.push({
      key: p.id ?? `${i}-${name}`,
      number: out.length + 1,
      name,
      description: p.description?.trim() ?? '',
      price: formatMoney(price),
      priceCents: price,
      valueLine: value > price ? `A ${formatMoney(value)} value. You save ${formatMoney(value - price)}.` : '',
    })
  }
  return out
}

export const lowestPackage = (views: readonly PackageView[]): number | null => (views.length ? Math.min(...views.map((v) => v.priceCents)) : null)

/** What a plan costs each month, to the nearest cent. */
export const perMonth = (dollars: number | null | undefined, months: number): string => formatMoney(Math.round(toCents(dollars) / months))
