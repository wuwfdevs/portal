'use client'
import { RowLabelProps, useRowLabel } from '@payloadcms/ui'

export const ChannelRowLabel: React.FC<RowLabelProps> = () => {
  const data = useRowLabel<{ name?: string | null }>()
  return <div>{data?.data?.name || 'Channel'}</div>
}
