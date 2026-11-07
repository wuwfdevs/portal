'use client'
import { Header } from '@/payload-types'
import { RowLabelProps, useRowLabel } from '@payloadcms/ui'

/** A header item's row: "Menu: News" or "Link: Podcasts". */
export const RowLabel: React.FC<RowLabelProps> = () => {
  const data = useRowLabel<NonNullable<Header['navItems']>[number]>()
  const item = data?.data
  if (item?.kind === 'menu') return <div>{item.label ? `Menu: ${item.label}` : 'Menu'}</div>
  return <div>{item?.link?.label ? `Link: ${item.link.label}` : 'Item'}</div>
}

export const LinkRowLabel: React.FC<RowLabelProps> = () => {
  const data = useRowLabel<{ link?: { label?: string | null } }>()
  return <div>{data?.data?.link?.label || 'Link'}</div>
}
