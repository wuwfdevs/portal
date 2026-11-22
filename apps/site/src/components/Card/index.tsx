import Link from 'next/link'
import React from 'react'

import type { Post } from '@/payload-types'

import { Media } from '@/components/Media'
import { SectionChip } from '@/components/Kit'
import { PlayAudioButton } from '@/components/ListenLive/PlayAudioButton'
import { formatLongDate } from '@/lib/format'
import { trackFromAudio } from '@/lib/player/track'
import { isVoyagerIdentity, VOYAGER_BADGE_LABEL } from '@/lib/voyager/identity'
import type { LeadClasses } from '@/lib/homepage/modules'
import { bylineOf, sectionOf } from '@/lib/homepage/story'
import { cn } from '@/utilities/ui'

/** `path` is the story's address; a card for a record without one (never published) shows its title without a link. */
export type CardPostData = Pick<Post, 'path' | 'categories' | 'meta' | 'title'> & Partial<Pick<Post, 'format' | 'publishingIdentity' | 'featuredAudio' | 'section' | 'publishedAt' | 'contributors'>>

/**
 * A story card. A story with audio carries a play button on the card itself (the one thing on it that is not part of the link); it plays in the site's one player. The whole card is clickable through one link whose box is stretched over it with CSS
 * (`after:absolute after:inset-0`), so it needs no script, keyboard and screen-reader users get exactly one
 * link, and text can still be selected.
 *
 * Two looks. `default` is the bordered card the list pages use. `editorial` (direction C2, the home page) has no border, shadow or fill: a `rounded-4` picture with the story's
 * section as a `SectionChip` caption on it (the name and colour of `doc.section`, which the query must have populated; a story with no loaded section has no chip), then a
 * semibold headline, and the summary held to three lines so a row of cards stays even. `lead` is how a news run's first story is laid out (`LEAD_ROW`: a row, with a larger headline); it applies to either look.
 * `showSection` is `false` where every card is of one section (a news run under that section's own heading), so the chip would only repeat the heading; the topics line stays
 * hidden then, as it is with the chip. `showDate` draws the story's date under its headline (a lead also gets its byline); a story without a date draws none.
 */
export const Card: React.FC<{
  alignItems?: 'center'
  className?: string
  doc?: CardPostData
  /** Show the picture in a fixed 3:2 frame, cropped to fill it, so a grid of cards lines up whatever shape the pictures are. */
  fixedImage?: boolean
  /** How a news run's lead story is laid out (`LEAD_ROW`): a row, picture left and words right. */
  lead?: LeadClasses
  showCategories?: boolean
  /** The date under the headline (and, on a lead, the byline). Off by default. */
  showDate?: boolean
  /** The section chip on the picture, in the editorial look. On by default. */
  showSection?: boolean
  title?: string
  variant?: 'default' | 'editorial'
}> = ({ className, doc, fixedImage, lead, showCategories, showDate = false, showSection = true, title: titleFromProps, variant = 'default' }) => {
  const { path, categories, meta, title, format, publishingIdentity, featuredAudio, publishedAt } = doc || {}
  const editorial = variant === 'editorial'
  // Whether the story has a section to show; the chip draws only when `showSection`, but the topics line stays hidden either way (a section's stories need no topics under them).
  const known = editorial && doc ? sectionOf({ section: doc.section }) : null
  const section = showSection ? known : null
  const { description, image: metaImage } = meta || {}

  const topics = (categories ?? [])
    .map((c) => (typeof c === 'object' && c !== null ? c.title : null))
    .filter((t): t is string => Boolean(t))
  const titleToUse = titleFromProps || title
  const href = path || null
  // Only a file the reader may play: a members-only story's audio comes back without its address for the public, so no button shows.
  const track = featuredAudio && typeof featuredAudio === 'object' ? trackFromAudio(featuredAudio, { title: titleToUse, href }) : null

  // "By Leigh Ostrander · Oct 28, 2026": the byline only on a lead, the date for any story that has one.
  const dateLine = showDate && doc ? [lead ? bylineOf(doc) : null, formatLongDate(publishedAt)].filter(Boolean).join(' · ') : ''

  return (
    <article
      className={cn(
        'relative flex flex-col',
        editorial ? 'gap-3' : 'overflow-hidden rounded-sm border border-rule bg-surface shadow-1 transition-shadow hover:shadow-2',
        lead?.card,
        className,
      )}
    >
      {metaImage && typeof metaImage !== 'string' && (
        fixedImage ? (
          <div className={cn('relative aspect-[3/2] w-full overflow-hidden bg-surface-3', editorial && 'rounded-4', lead?.frame)}>
            <Media imgClassName="absolute inset-0 size-full object-cover" resource={metaImage} size="33vw" />
            {section && <SectionChip className="absolute bottom-3 left-3" label={section.title} swatch={section.swatch} />}
          </div>
        ) : (
          <div className={cn('relative w-full', editorial && 'overflow-hidden rounded-4')}>
            <Media resource={metaImage} size="33vw" />
            {section && <SectionChip className="absolute bottom-3 left-3" label={section.title} swatch={section.swatch} />}
          </div>
        )
      )}
      <div className={cn('flex flex-col gap-2', editorial ? 'p-0' : 'p-4', lead?.body)}>
        {format === 'live' && (
          <p className="text-xs font-bold uppercase tracking-widest text-wuwf-blue-700">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-wuwf-blue-100 px-2 py-0.5">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-wuwf-blue-700" />
              Live updates
            </span>
          </p>
        )}
        {isVoyagerIdentity(publishingIdentity) && (
          <SectionChip className="self-start" label={VOYAGER_BADGE_LABEL} swatch="teal" />
        )}
        {showCategories && topics.length > 0 && !(editorial && known) && (
          <p className="text-xs font-bold uppercase tracking-widest text-wuwf-blue-700">{topics.join(', ')}</p>
        )}
        {titleToUse && (
          <h3 className={cn('font-serif text-xl leading-snug', editorial ? 'font-semibold' : 'font-bold', lead?.title)}>
            {href ? (
              <Link className="text-ink after:absolute after:inset-0 hover:text-wuwf-blue-700" href={href}>
                {titleToUse}
              </Link>
            ) : (
              titleToUse
            )}
          </h3>
        )}
        {dateLine && <p className="text-sm text-ink-3">{dateLine}</p>}
        {description && <p className={cn('text-base text-ink-2', editorial && 'line-clamp-3')}>{description.replace(/\s/g, ' ')}</p>}
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
