// Numbers and cells as a reader sees them. One place, so a chart's axis, its data table, a map's legend and a table column all agree.

import type { Cell } from './types'
import type { ValueFormat } from './spec'

export const DEFAULT_FORMAT: ValueFormat = { style: 'number' }

export function makeFormatter(format: ValueFormat | null | undefined): (n: number) => string {
  const f = format ?? DEFAULT_FORMAT
  const digits = f.decimals ?? undefined
  const nf = new Intl.NumberFormat('en-US', {
    style: f.style === 'percent' ? 'percent' : f.style === 'currency' ? 'currency' : 'decimal',
    ...(f.style === 'currency' ? { currency: 'USD' } : {}),
    ...(digits !== undefined ? { minimumFractionDigits: digits, maximumFractionDigits: digits } : { maximumFractionDigits: f.style === 'percent' ? 1 : 3 }),
    ...(f.compact ? { notation: 'compact' as const } : {}),
  })
  const prefix = f.style === 'number' ? (f.prefix ?? '') : ''
  const suffix = f.style === 'number' ? (f.suffix ?? '') : ''
  return (n) => `${prefix}${nf.format(n)}${suffix}`
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const dateFormat = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })

/** A date cell as text: a plain date as "Mar 5, 2025"; anything with a time is left as typed (a time zone is not ours to guess). */
export function formatDateCell(value: string): string {
  if (DATE_ONLY.test(value)) {
    const d = new Date(`${value}T00:00:00Z`)
    if (!Number.isNaN(d.getTime())) return dateFormat.format(d)
  }
  return value
}

/** Any cell as text for a table or a screen reader. An empty cell is an en dash, never "null". */
export function formatCell(cell: Cell, type: 'number' | 'string' | 'date' | 'boolean', format?: ValueFormat | null): string {
  if (cell === null || cell === undefined || cell === '') return '–'
  if (type === 'number' && typeof cell === 'number') return makeFormatter(format)(cell)
  if (type === 'date' && typeof cell === 'string') return formatDateCell(cell)
  if (typeof cell === 'boolean') return cell ? 'Yes' : 'No'
  return String(cell)
}

const YEAR_NAME = /\b(year|yr|fy|season|vintage)\b/i

/**
 * A column of years reads "2019", not "2,019". Whole numbers within 1800 to 2200 are taken for years; with "year" in the column's name the range is wider.
 * Anything else (a count that happens to be 2,019) keeps its thousands separator.
 */
export function isYearColumn(name: string, values: ReadonlyArray<Cell>): boolean {
  const [lo, hi] = YEAR_NAME.test(name) ? [1000, 2999] : [1800, 2200]
  const nums = values.filter((v): v is number => typeof v === 'number')
  return nums.length > 0 && nums.every((n) => Number.isInteger(n) && n >= lo && n <= hi)
}
