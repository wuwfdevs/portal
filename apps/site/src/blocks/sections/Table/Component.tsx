import React from 'react'

import { SectionBand } from '../SectionBand'
import type { SectionData, SectionProps } from '../types'

export interface TableData extends SectionData {
  columns?: Array<string | null> | null
  rows?: Array<{ id?: string | null; cells?: Array<string | null> | null } | null> | null
  caption?: string | null
}

/** The table's shape: column names, and each row cut or padded to that many cells. A row with no cell at all is left out. */
export function tableOf(columns: TableData['columns'], rows: TableData['rows']): { head: string[]; body: string[][] } | null {
  const head = (columns ?? []).map((c) => (typeof c === 'string' ? c.trim() : ''))
  while (head.length > 0 && head[head.length - 1] === '') head.pop()
  if (head.length < 2) return null
  const body = (rows ?? [])
    .map((r) => (r?.cells ?? []).map((c) => (typeof c === 'string' ? c.trim() : '')))
    .filter((cells) => cells.some((c) => c !== ''))
    .map((cells) => Array.from({ length: head.length }, (_, i) => cells[i] ?? ''))
  return body.length > 0 ? { head, body } : null
}

/** Table. A region that scrolls sideways on a phone and can be reached by keyboard; the first column names each row. */
export function TableSection({ block }: SectionProps<TableData>) {
  const table = tableOf(block.columns, block.rows)
  if (!table) return null
  const caption = block.caption?.trim()
  const label = block.heading?.title?.trim() || caption || 'Table'
  return (
    <SectionBand block={block} heading={block.heading}>
      <div aria-label={label} className="overflow-x-auto rounded-lg border [background-color:var(--tone-card)] [border-color:var(--tone-card-rule)]" role="region" tabIndex={0}>
        <table className="w-full min-w-[32rem] border-collapse text-left text-base">
          {caption && <caption className="p-3 text-left text-sm [color:var(--tone-muted)]">{caption}</caption>}
          <thead>
            <tr>
              {table.head.map((h, i) => (
                <th className="border-b-2 px-4 py-3 text-xs font-bold uppercase tracking-[0.04em] [border-color:var(--tone-card-rule)] [color:var(--tone-muted)]" key={`${h}-${i}`} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.body.map((cells, r) => (
              <tr key={r}>
                {cells.map((c, i) =>
                  i === 0 ? (
                    <th className="border-b px-4 py-3 font-bold [border-color:var(--tone-card-rule)]" key={i} scope="row">
                      {c}
                    </th>
                  ) : (
                    <td className="border-b px-4 py-3 [border-color:var(--tone-card-rule)]" key={i}>
                      {c}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionBand>
  )
}
