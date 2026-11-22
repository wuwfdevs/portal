import { parseHTML } from 'linkedom'

import { formatCell, isYearColumn } from '../format'
import type { ValueFormat } from '../spec'
import type { DatasetTable, Row } from '../types'
import type { PlainTable } from './types'

/** The most rows an on-page data table lists; the download has the rest. */
export const PLAIN_TABLE_LIMIT = 200

/** The columns of a dataset as a table of words, for a reader who cannot use the picture. */
export function plainTable(table: DatasetTable, names: string[], formats: Record<string, ValueFormat | null | undefined> = {}, rows: Row[] = table.rows): PlainTable {
  const cols = names.map((n) => table.columns.find((c) => c.name === n)).filter((c): c is NonNullable<typeof c> => Boolean(c))
  const years = new Set(cols.filter((c) => c.type === 'number' && !formats[c.name] && isYearColumn(c.name, table.rows.map((r) => r[c.name] ?? null))).map((c) => c.name))
  return {
    columns: cols.map((c) => c.name),
    rows: rows.slice(0, PLAIN_TABLE_LIMIT).map((r) => cols.map((c) => (years.has(c.name) && typeof r[c.name] === 'number' ? String(r[c.name]) : formatCell(r[c.name] ?? null, c.type, formats[c.name])))),
    more: Math.max(0, rows.length - PLAIN_TABLE_LIMIT),
  }
}

/**
 * A document for Plot to build elements in: a tiny DOM, nothing a browser ever sees (the drawing is read back out as a tree, `svg-tree.ts`).
 * One per drawing, so ids and state never leak between two.
 */
export function newDocument(): Document {
  return parseHTML('<!doctype html><html><body></body></html>').document as unknown as Document
}
