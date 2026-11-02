'use client'
import type { SupportPage } from '@/payload-types'

import { type RowLabelProps, useRowLabel } from '@payloadcms/ui'

export const LevelRowLabel: React.FC<RowLabelProps> = () => {
  const data = useRowLabel<NonNullable<SupportPage['levels']>[number]>()
  const name = data?.data?.name
  const amount = data?.data?.amount
  const position = data?.rowNumber !== undefined ? data.rowNumber + 1 : ''
  return <div>{name ? `${position}. ${name}${amount ? ` (${amount})` : ''}` : `Level ${position}`}</div>
}
