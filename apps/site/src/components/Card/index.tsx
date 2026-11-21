import Link from 'next/link'
import React from 'react'

import type { Post } from '@/payload-types'

import { Media } from '@/components/Media'
import { PlayAudioButton } from '@/components/ListenLive/PlayAudioButton'
import { trackFromAudio } from '@/lib/player/track'
import { isVoyagerIdentity, VOYAGER_BADGE_LABEL } from '@/lib/voyager/identity'
import type { LeadClasses } from '@/lib/homepage/modules'
import { cn } from '@/utilities/ui'

/** `path` is the story's address; a card for a record without one (never published) shows its title without a link. */
export type CardPostData = Pick<Post, 'path' | 'categories' | 'meta' | 'title'> & Partial<Pick<Post, 'format' | 'publishingIdentity' | 'featuredAudio'>>

/**
 * A story card. A story with audio carries a play button on the card itself (the one thing on it that is not part of the link); it plays in the site's one player. The whole card is clickable through one link whose box is stretched over it with CSS
 * (`after:absolute after:inset-0`), so it needs no script, keyboard and screen-reader users get exactly one
 * link, and text can still be selected.
 */
export const Card: React.FC<{
  alignItems?: 'center'
  className?: string
  doc?: CardPostData
  /** Show the picture in a fixed 3:2 frame, cropped to fill it, so a grid of cards lines up whatever shape the pictures are. */
  fixedImage?: boolean
  /** How a news run's lead card is laid out where it spans columns (`leadCardClasses`): a row, picture left and words right. */
  lead?: LeadClasses
  showCategories?: boolean
  title?: string
}> = ({ className, doc, fixedImage, lead, showCategories, title: titleFromProps }) => {
  const { path, categories, meta, title, format, publishingIdentity, featuredAudio } = doc || {}
  const { description, image: metaImage } = meta || {}

  const topics = (categories ?? [])
    .map((c) => (typeof c === 'object' && c !== null ? c.title : null))
    .filter((t): t is string => Boolean(t))
  const titleToUse = titleFromProps || title
  const href = path || null
  // Only a file the reader may play: a members-only story's audio comes back without its address for the public, so no button shows.
  const track = featuredAudio && typeof featuredAudio === 'object' ? trackFromAudio(featuredAudio, { title: titleToUse, href }) : null

  return (
    <article
      className={cn(
        'relative flex flex-col overflow-hidden rounded-sm border border-rule bg-surface shadow-1 transition-shadow hover:shadow-2',
        lead?.card,
        className,
      )}
    >
      {metaImage && typeof metaImage !== 'string' && (
        fixedImage ? (
          <div className={cn('relative aspect-[3/2] w-full overflow-hidden bg-surface-3', lead?.frame)}>
            <Media imgClassName="absolute inset-0 size-full object-cover" resource={metaImage} size="33vw" />
          </div>
        ) : (
          <div className="relative w-full">
            <Media resource={metaImage} size="33vw" />
          </div>
        )
      )}
      <div className={cn('flex flex-col gap-2 p-4', lead?.body)}>
        {format === 'live' && (
          <p className="text-xs font-bold uppercase tracking-widest text-wuwf-blue-700">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-wuwf-blue-100 px-2 py-0.5">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-wuwf-blue-700" />
              Live updates
            </span>
          </p>
        )}
        {isVoyagerIdentity(publishingIdentity) && (
          <p className="text-xs font-bold uppercase tracking-widest text-wuwf-teal">
            <span className="inline-flex items-center rounded-pill border border-wuwf-teal px-2 py-0.5">{VOYAGER_BADGE_LABEL}</span>
          </p>
        )}
        {showCategories && topics.length > 0 && (
          <p className="text-xs font-bold uppercase tracking-widest text-wuwf-blue-700">{topics.join(', ')}</p>
        )}
        {titleToUse && (
          <h3 className={cn('font-serif text-xl font-bold leading-snug', lead?.title)}>
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
        {track && (
          // Above the card's stretched link (`z-10`), so pressing it plays the audio in the site's player instead of opening the story.
          <div className="relative z-10 self-start pt-1">
            <PlayAudioButton track={track} />
          </div>
        )}
      </div>
    </article>
  )
}
