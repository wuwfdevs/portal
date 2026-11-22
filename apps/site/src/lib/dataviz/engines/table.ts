// The table engine: which columns, in what order, how each is written, and where the table starts. The model is plain rows; the view
// (TanStack Table) adds sorting, search and paging. A table of a size that fits a page is drawn without any script at all.

import { checkFormat, validateTable, DEFAULT_PAGE_SIZE, type TableSpec } from '../spec'
import type { Cell } from '../types'
import type { Engine, PrepareContext, TableModel } from './types'

/** The most rows a table carries to the browser; the download holds every row. */
export const MAX_TABLE_ROWS = 1_000

export const tableEngine: Engine<TableSpec, TableModel> = {
  kind: 'table',
  label: 'Data table',
  validate: (spec, ctx) => [
    ...validateTable(spec, ctx),
    ...(spec.columns ?? []).flatMap((c) => (checkFormat(c.format) ? [checkFormat(c.format)!] : [])),
  ],
  prepare(spec, ctx: PrepareContext) {
    const all = ctx.dataset.table.columns
    const chosen = (spec.columns ?? []).length > 0 ? spec.columns : all.map((c) => ({ column: c.name, label: null, format: null }))
    const columns = chosen.flatMap((c) => {
      const col = all.find((a) => a.name === c.column)
      return col ? [{ id: col.name, label: c.label?.trim() || col.name, type: col.type, format: col.type === 'number' ? (c.format ?? null) : null }] : []
    })
    const rows = ctx.dataset.table.rows.slice(0, MAX_TABLE_ROWS).map((r) => columns.map<Cell>((c) => r[c.id] ?? null))
    const size = spec.pageSize ?? DEFAULT_PAGE_SIZE
    return {
      engine: 'table',
      columns,
      rows,
      searchable: Boolean(spec.searchable),
      pageSize: Math.max(5, Math.min(100, size)),
      sort: spec.sortColumn && columns.some((c) => c.id === spec.sortColumn) ? { column: spec.sortColumn, direction: spec.sortDirection === 'desc' ? 'desc' : 'asc' } : null,
      omitted: Math.max(0, ctx.dataset.table.rows.length - MAX_TABLE_ROWS),
    }
  },
}
