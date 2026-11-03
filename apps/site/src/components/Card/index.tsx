import Link from 'next/link'
import React from 'react'

import type { Post } from '@/payload-types'

import { Media } from '@/components/Media'
import { cn } from '@/utilities/ui'

/** `path` is the story's address; a card for a record without one (never published) shows its title without a link. */
export type CardPostData = Pick<Post, 'path' | 'categories' | 'meta' | 'title'>

/**
 * A story card. The whole card is clickable through one link whose box is stretched over it with CSS
 * (`after:absolute after:inset-0`), so it needs no script, keyboard and screen-reader users get exactly one
 * link, and text can still be selected.
 */
export const Card: React.FC<{
  alignItems?: 'center'
  className?: string
  doc?: CardPostData
  /** Show the picture in a fixed 3:2 frame, cropped to fill it, so a grid of cards lines up whatever shape the pictures are. */
  fixedImage?: boolean
  showCategories?: boolean
  title?: string
}> = ({ className, doc, fixedImage, showCategories, title: titleFromProps }) => {
  const { path, categories, meta, title } = doc || {}
  const { description, image: metaImage } = meta || {}

  const topics = (categories ?? [])
    .map((c) => (typeof c === 'object' && c !== null ? c.title : null))
    .filter((t): t is string => Boolean(t))
  const titleToUse = titleFromProps || title
  const href = path || null

  return (
    <article
      className={cn(
        'relative flex flex-col overflow-hidden rounded-sm border border-rule bg-surface shadow-1 transition-shadow hover:shadow-2',
        className,
      )}
    >
      {metaImage && typeof metaImage !== 'string' && (
        fixedImage ? (
          <div className="relative aspect-[3/2] w-full overflow-hidden bg-surface-3">
            <Media imgClassName="absolute inset-0 size-full object-cover" resource={metaImage} size="33vw" />
          </div>
        ) : (
          <div className="relative w-full">
            <Media resource={metaImage} size="33vw" />
          </div>
        )
      )}
      <div className="flex flex-col gap-2 p-4">
        {showCategories && topics.length > 0 && (
          <p className="text-xs font-bold uppercase tracking-widest text-wuwf-blue-700">{topics.join(', ')}</p>
        )}
        {titleToUse && (
          <h3 className="font-serif text-xl font-bold leading-snug">
            {href ? (
              <Link className="text-ink after:absolute after:inset-0 hover:text-wuwf-blue-700" href={href}>
                {titleToUse}
              </Link>
            ) : (
              titleToUse
            )}
          </h3>
        )}
        {description && <p className="text-base text-ink-2">{description.replace(/\s/g, ' ')}</p>}
      </div>
    </article>
  )
}
