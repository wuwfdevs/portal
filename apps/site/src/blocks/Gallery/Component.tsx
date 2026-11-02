import React from 'react'

import type { GalleryBlock as GalleryBlockProps } from '@/payload-types'

import { Media } from '@/components/Media'
import { cn } from '@/utilities/ui'

type Item = NonNullable<GalleryBlockProps['images']>[number]

function Slide({ item, uniform = false }: { item: Item; uniform?: boolean }) {
  const image = item.image && typeof item.image === 'object' ? item.image : null
  const credit = item.credit || image?.credit || null
  return (
    <>
      {uniform ? (
        // Galleries mix portrait and landscape pictures. A carousel gives each the same frame and shows the whole
        // picture inside it, so no slide towers over its neighbours and nothing is cropped.
        <div className="relative aspect-[3/2] w-full overflow-hidden rounded-sm bg-surface-3">
          <Media imgClassName="absolute inset-0 size-full object-contain" resource={item.image} />
        </div>
      ) : (
        <Media imgClassName="rounded-sm" resource={item.image} />
      )}
      {(item.title || item.caption || credit) && (
        <p className="font-sans text-sm text-ink-3">
          {item.title && <strong className="block font-bold text-ink-2">{item.title}</strong>}
          {item.caption}
          {item.caption && credit ? ' ' : ''}
          {credit && <span className="italic">{credit}</span>}
        </p>
      )}
    </>
  )
}

export const GalleryBlock: React.FC<GalleryBlockProps & { className?: string }> = ({
  title,
  description,
  layout,
  images,
  className,
}) => {
  const items = (images ?? []).filter((i) => i.image && typeof i.image === 'object')
  if (items.length === 0) return null
  const label = title || 'Photo gallery'
  return (
    <figure className={cn('not-prose my-8', className)}>
      {title && <figcaption className="mb-1 font-sans text-base font-bold text-ink">{title}</figcaption>}
      {description && <p className="mb-3 font-sans text-sm text-ink-3">{description}</p>}
      {layout === 'carousel' ? (
        // A scroll-snap strip with no script: it scrolls by touch, wheel or keyboard (the strip is focusable so the
        // arrow keys work), and a screen reader reads it as a list of items.
        <div
          aria-label={label}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wuwf-blue-700"
          role="region"
          tabIndex={0}
        >
          <ul className="flex gap-4">
            {items.map((item, i) => (
              <li
                className="flex w-[85vw] max-w-xl shrink-0 snap-center flex-col gap-2"
                key={item.id ?? i}
              >
                <Slide item={item} uniform />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className={cn('grid gap-4', layout === 'list' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}>
          {items.map((item, i) => (
            <li className="flex flex-col gap-2" key={item.id ?? i}>
              <Slide item={item} />
            </li>
          ))}
        </ul>
      )}
    </figure>
  )
}
