'use client'

import {
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
  type ColumnDef,
} from '@tanstack/react-table'
import React, { useId, useMemo, useState } from 'react'

import { formatCell } from '@/lib/dataviz/format'
import type { TableModel } from '@/lib/dataviz/engines/types'
import type { Cell } from '@/lib/dataviz/types'

// Features are chosen one by one so the table's script stays small: sorting, search and paging, nothing else.
const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { basic: sortFn_basic, alphanumeric: sortFn_alphanumeric },
  filterFns: { includesString: filterFn_includesString },
})

type Row = Record<string, Cell>

/**
 * The interactive data table: sort by a heading, search, page. It is drawn on the server like any component (a reader without script gets the
 * first page as a plain table) and takes over in the browser. The cells are the stored values, written by the same `formatCell` the text tables use.
 */
export function DataTable({ model, caption }: { model: TableModel; caption: string }) {
  const searchId = useId()
  const [search, setSearch] = useState('')
  const data = useMemo<Row[]>(() => model.rows.map((cells) => Object.fromEntries(model.columns.map((c, i) => [c.id, cells[i] ?? null]))), [model])
  const columns = useMemo<ColumnDef<typeof features, Row>[]>(
    () =>
      model.columns.map((c) => ({
        id: c.id,
        accessorFn: (row: Row) => row[c.id] ?? null,
        header: c.label,
        sortFn: c.type === 'number' ? 'basic' : 'alphanumeric',
        cell: (info: { getValue: () => unknown }) => formatCell((info.getValue() as Cell) ?? null, c.type, c.format),
        meta: { numeric: c.type === 'number' },
      })) as ColumnDef<typeof features, Row>[],
    [model],
  )
  const table = useTable({
    features,
    columns,
    data,
    initialState: {
      pagination: { pageIndex: 0, pageSize: model.pageSize },
      sorting: model.sort ? [{ id: model.sort.column, desc: model.sort.direction === 'desc' }] : [],
    },
    globalFilterFn: 'includesString',
    state: { globalFilter: search },
    onGlobalFilterChange: (updater: unknown) => setSearch(typeof updater === 'function' ? (updater as (s: string) => string)(search) : String(updater ?? '')),
  } as never)

  const rows = table.getRowModel().rows
  const total = table.getFilteredRowModel().rows.length
  const { pageIndex, pageSize } = table.state.pagination
  const first = total === 0 ? 0 : pageIndex * pageSize + 1
  const last = Math.min(total, (pageIndex + 1) * pageSize)
  const pages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="flex flex-col gap-3 font-sans text-ink">
      {model.searchable && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-ink-2" htmlFor={searchId}>
            Search this table
          </label>
          <input
            className="min-h-11 w-full max-w-sm rounded-lg border border-rule-strong bg-surface px-3 text-base text-ink"
            id={searchId}
            onChange={(e) => setSearch(e.target.value)}
            type="search"
            value={search}
          />
        </div>
      )}
      <div aria-label={caption} className="overflow-x-auto rounded-lg border border-rule" role="region" tabIndex={0}>
        <table className="w-full min-w-[28rem] border-collapse text-left text-base">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface-2">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header, i) => {
                  const sorted = header.column.getIsSorted()
                  const numeric = model.columns[i]?.type === 'number'
                  return (
                    <th
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                      className={`border-b-2 border-rule-strong p-0 text-xs font-bold uppercase tracking-[0.04em] text-ink-3 ${numeric ? 'text-right' : ''}`}
                      key={header.id}
                      scope="col"
                    >
                      <button
                        className={`flex min-h-11 w-full items-center gap-1 px-3 py-2 uppercase ${numeric ? 'justify-end' : ''}`}
                        onClick={header.column.getToggleSortingHandler()}
                        type="button"
                      >
                        {model.columns[i]?.label}
                        <span aria-hidden="true">{sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : '↕'}</span>
                      </button>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="odd:bg-surface even:bg-surface-2/40" key={row.id}>
                {row.getAllCells().map((cell, i) =>
                  i === 0 ? (
                    <th className="border-b border-rule px-3 py-2 font-semibold" key={cell.id} scope="row">
                      <table.FlexRender cell={cell} />
                    </th>
                  ) : (
                    <td className={`border-b border-rule px-3 py-2 ${model.columns[i]?.type === 'number' ? 'text-right tabular-nums' : ''}`} key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </td>
                  ),
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-ink-3" colSpan={model.columns.length}>
                  Nothing matches “{search}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-3">
        <p aria-live="polite">{total === 0 ? 'No rows' : `Rows ${first} to ${last} of ${total.toLocaleString('en-US')}`}</p>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <button className="min-h-11 rounded-full border border-rule-strong px-4 font-semibold text-ink disabled:opacity-40" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} type="button">
              Previous
            </button>
            <span>
              Page {pageIndex + 1} of {pages}
            </span>
            <button className="min-h-11 rounded-full border border-rule-strong px-4 font-semibold text-ink disabled:opacity-40" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} type="button">
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
