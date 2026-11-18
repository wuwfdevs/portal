'use client'
import { RowLabelProps, useRowLabel } from '@payloadcms/ui'

type Row = { kind?: 'sponsor' | 'house' | null; sponsor?: string | null; alt?: string | null; enabled?: boolean | null }

/** "3 · Sponsor: Acme", "4 · House promotion: Get the apps", with "(off)" when the tile is switched off. */
export const TileRowLabel: React.FC<RowLabelProps> = () => {
  const row = useRowLabel<Row>()
  const data = row?.data
  const who = data?.kind === 'house' ? `House promotion: ${data?.alt || 'untitled'}` : `Sponsor: ${data?.sponsor || data?.alt || 'untitled'}`
  return (
    <div>
      {String(row?.rowNumber != null ? row.rowNumber + 1 : '')} · {who}
      {data?.enabled === false ? ' (off)' : ''}
    </div>
  )
}
