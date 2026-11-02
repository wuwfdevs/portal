import React from 'react'

import type { GalleryBlock as GalleryBlockProps } from '@/payload-types'

import { Media } from '@/components/Media'
import { cn } from '@/utilities/ui'

export const GalleryBlock: React.FC<GalleryBlockProps & { className?: string }> = ({ title, layout, images, className }) => {
  const items = (images ?? []).filter((i) => i.image && typeof i.image === 'object')
  if (items.length === 0) return null
  return (
    <figure className={cn('not-prose my-8', className)}>
      {title && <figcaption className="mb-3 font-sans text-base font-bold text-ink">{title}</figcaption>}
      <ul className={cn('grid gap-4', layout === 'list' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}>
        {items.map((item, i) => (
          <li className="flex flex-col gap-2" key={item.id ?? i}>
            <Media imgClassName="rounded-sm" resource={item.image} />
            {(item.caption || item.credit) && (
              <p className="font-sans text-sm text-ink-3">
                {item.caption}
                {item.caption && item.credit ? ' ' : ''}
                {item.credit && <span className="italic">{item.credit}</span>}
              </p>
            )}
          </li>
        ))}
      </ul>
    </figure>
  )
}
