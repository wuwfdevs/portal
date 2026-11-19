'use client'
import type { GivingSetting } from '@/payload-types'

import { type RowLabelProps, useRowLabel } from '@payloadcms/ui'

export const GivingLevelRowLabel: React.FC<RowLabelProps> = () => {
  const data = useRowLabel<NonNullable<GivingSetting['levels']>[number]>()
  const name = data?.data?.name
  const amount = data?.data?.amount
  const position = data?.rowNumber !== undefined ? data.rowNumber + 1 : ''
  return <div>{name ? `${position}. ${name}${amount ? ` (${amount})` : ''}` : `Level ${position}`}</div>
}
