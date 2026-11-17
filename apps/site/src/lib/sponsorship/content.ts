// The Sponsorship global as the pages read it. Pure: shapes and small helpers over what the admin holds. Nothing here is copy.

import type { Sponsorship } from '@/payload-types'

/** What a page may see: the global without the staff-only inquiry address. */
export type SponsorshipContent = Omit<Sponsorship, 'inquiryEmail'>

/** A section is shown unless an editor switched it off (an unset switch counts as on). */
export const shown = <T extends { show?: boolean | null } | null | undefined>(section: T): section is NonNullable<T> => Boolean(section) && section?.show !== false

/** Paragraphs of a text area: split at blank lines, empty ones dropped. */
export const paragraphs = (value: string | null | undefined): string[] =>
  (value ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

/** "Talk to us about {name}" with the name filled in. */
export const fill = (template: string | null | undefined, vars: Record<string, string>): string =>
  (template ?? '').replace(/\{(\w+)\}/g, (whole, key: string) => vars[key] ?? whole)

/** A `tel:` link from the number as people read it: "850 473-7453" becomes tel:+18504737453. */
export function phoneHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length === 10) return `tel:+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`
  return digits.length >= 7 ? `tel:${digits}` : null
}

/** "A", "A and B", "A, B and C". */
export const listOf = (names: readonly string[]): string => (names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

/** A link that is only drawn when it has both words and a safe address (the field validator allows nothing else). */
export const linkOf = (label: string | null | undefined, to: string | null | undefined): { label: string; href: string } | null =>
  label?.trim() && to?.trim() ? { label: label.trim(), href: to.trim() } : null

/** Figures from the admin, as the grid draws them: a figure needs its number and its words. */
export function toStats(rows: readonly { value?: string | null; text?: string | null; compare?: string | null }[] | null | undefined): { value: string; text: string; compare?: string }[] {
  return (rows ?? []).filter((r) => r.value?.trim() && r.text?.trim()).map((r) => ({ value: r.value!.trim(), text: r.text!.trim(), ...(r.compare?.trim() ? { compare: r.compare.trim() } : {}) }))
}
