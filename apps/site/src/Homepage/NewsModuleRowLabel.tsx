'use client'
import { RowLabelProps, useRowLabel } from '@payloadcms/ui'

/** "Local News", with "(off)" when the section is switched off. */
export const NewsModuleRowLabel: React.FC<RowLabelProps> = () => {
  const row = useRowLabel<{ heading?: string | null; enabled?: boolean | null }>()
  const data = row?.data
  return (
    <div>
      {data?.heading || 'Section'}
      {data?.enabled === false ? ' (off)' : ''}
    </div>
  )
}
