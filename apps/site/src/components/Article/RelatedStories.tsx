import Link from 'next/link'
import React from 'react'

import type { Media as MediaDoc } from '@/payload-types'
import type { RelatedStory } from '@/lib/embeddings/related'

import { ImagePlaceholder } from '@/components/Kit'
import { SectionHeader } from '@/components/SectionHeader'
import { PlayAudioButton } from '@/components/ListenLive/PlayAudioButton'
import { Media } from '@/components/Media'
import { namedRecord, presentRelated, storyFactsOf, type RelatedFacts, type RelatedPresentation, type StoryFacts } from '@/lib/embeddings/present'
import { leadPicture } from '@/lib/homepage/select'
import { trackFromAudio } from '@/lib/player/track'
import { isVoyagerIdentity } from '@/lib/voyager/identity'
import { cn } from '@/utilities/ui'

const TONE: Record<RelatedPresentation['tone'], string> = {
  topic: 'text-wuwf-blue-700',
  show: 'text-wuwf-teal',
  voyager: 'text-ink',
}

const Kicker: React.FC<{ presentation: RelatedPresentation }> = ({ presentation }) =>
  presentation.kicker ? <p className={cn('text-xs font-bold uppercase tracking-widest', TONE[presentation.tone])}>{presentation.kicker}</p> : null

const Meta: React.FC<{ presentation: RelatedPresentation }> = ({ presentation }) => {
  if (!presentation.sameLabel && !presentation.date) return null
  return (
    <p className="flex flex-wrap gap-x-2 text-sm text-ink-3">
      {presentation.sameLabel && <strong className="font-bold text-wuwf-blue-700">{presentation.sameLabel} ·</strong>}
      {presentation.date && <time dateTime={presentation.dateTime ?? undefined}>{presentation.date}</time>}
    </p>
  )
}

/** The story's title as the one link of the entry. Its box is stretched over the entry with CSS, as on `Card`, so the whole entry is clickable and keyboard and screen-reader users get one link. */
const Title: React.FC<{ story: RelatedStory; className: string }> = ({ story, className }) => (
  <h3 className={cn('font-serif text-ink', className)}>
    {story.path ? (
      <Link className="after:absolute after:inset-0 hover:text-wuwf-blue-700 hover:underline" href={story.path}>
        {story.title}
      </Link>
    ) : (
      story.title
    )}
  </h3>
)

const imageOf = (story: RelatedStory) => leadPicture<MediaDoc>({ featuredMedia: story.featuredMedia, meta: story.meta })

/** Only a file the reader may play: a members-only story's audio comes back without its address for the public, so no button shows. */
const trackOf = (story: RelatedStory) =>
  story.featuredAudio && typeof story.featuredAudio === 'object' ? trackFromAudio(story.featuredAudio, { title: story.title, href: story.path ?? null }) : null

/** Above the stretched link (`z-10`), so pressing it plays the audio in the site's player instead of opening the story. */
const Listen: React.FC<{ story: RelatedStory }> = ({ story }) => {
  const track = trackOf(story)
  return track ? (
    <div className="relative z-10 self-start">
      <PlayAudioButton track={track} />
    </div>
  ) : null
}

function presentationOf(current: StoryFacts, story: RelatedStory, now: Date): RelatedPresentation {
  const facts = storyFactsOf(story)
  const production = namedRecord(story.production)
  const series = namedRecord(story.series)
  const related: RelatedFacts = {
    ...facts,
    format: story.format,
    productionTitle: production?.title ?? null,
    publishedAt: story.publishedAt,
    seriesTitle: series?.title ?? null,
    voyager: isVoyagerIdentity(story.publishingIdentity),
  }
  return presentRelated(current, related, now)
}

/**
 * "More like this" under a story (board 3a): the closest story leads and the rest are short rows. It says why a story is offered only
 * when it can (the same topic, series or show), says "From" before the date of anything over a year old, and keeps the audio play
 * button. The same list for every reader; nothing about the reader is used. With no stories it renders nothing, not even a heading.
 *
 * `stories` come closest first (`pickRelated`). `current` is the story being read.
 */
export const RelatedStories: React.FC<{ current: StoryFacts; now?: Date; stories: RelatedStory[] }> = ({ current, now = new Date(), stories }) => {
  const [lead, ...rest] = stories
  if (!lead) return null

  const leadImage = imageOf(lead)
  const leadPresentation = presentationOf(current, lead, now)
  const solo = rest.length === 0

  return (
    <section aria-labelledby="related-heading" className="container mt-16 flex flex-col gap-8">
      <SectionHeader id="related-heading" title="More like this" />

      <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-14">
        <article className={cn('relative flex min-w-0 flex-col gap-4', solo ? 'md:flex-row md:items-center md:gap-10 lg:grow' : 'lg:grow-3 lg:basis-0')}>
          {/* Always a frame: a story with no picture gets the placeholder, so the section keeps one shape. */}
          <div className={cn('relative aspect-video w-full overflow-hidden rounded-4 bg-surface-3', solo && 'md:flex-1')}>
            {leadImage ? (
              <Media imgClassName="absolute inset-0 size-full object-cover" resource={leadImage} size={solo ? '(min-width: 768px) 50vw, 100vw' : '(min-width: 1024px) 55vw, 100vw'} />
            ) : (
              <ImagePlaceholder className="absolute inset-0" />
            )}
          </div>
          <div className={cn('flex min-w-0 flex-col gap-3', solo && 'md:flex-1')}>
            <Kicker presentation={leadPresentation} />
            <Title className="text-2xl font-semibold leading-tight tracking-tight md:text-3xl" story={lead} />
            {lead.meta?.description && <p className="line-clamp-3 text-lg text-ink-2">{lead.meta.description.replace(/\s/g, ' ')}</p>}
            <Meta presentation={leadPresentation} />
            <Listen story={lead} />
          </div>
        </article>

        {rest.length > 0 && (
          <ul className="flex min-w-0 flex-col lg:grow-2 lg:basis-0">
            {rest.map((story) => {
              const image = imageOf(story)
              const presentation = presentationOf(current, story, now)
              return (
                <li className="relative border-t border-rule py-5 first:border-t-0 first:pt-0" key={story.id}>
                  <div className="flex gap-4">
                    <div className="relative aspect-[3/2] w-28 shrink-0 self-start overflow-hidden rounded-4 bg-surface-3">
                      {image ? <Media imgClassName="absolute inset-0 size-full object-cover" resource={image} size="112px" /> : <ImagePlaceholder className="absolute inset-0" />}
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <Kicker presentation={presentation} />
                      <Title className="text-xl font-semibold leading-snug" story={story} />
                      <Meta presentation={presentation} />
                      <Listen story={story} />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
