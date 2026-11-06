import Link from 'next/link'
import React from 'react'

import type { Contributor, Post, Production } from '@/payload-types'

import { AudioPlayerBlock } from '@/blocks/AudioPlayer/Component'
import { Acknowledgment } from '@/components/Acknowledgment'
import { FeaturedMedia } from '@/components/Article/FeaturedMedia'
import { MembersOnlyPanel } from '@/components/Members/MembersOnlyPanel'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import RichText from '@/components/RichText'
import { formatDuration, formatLongDate } from '@/lib/format'
import type { ShowTheme } from '@/lib/shows/themes'
import type { AcknowledgmentLine } from '@/lib/underwriting/resolve'
import { cn } from '@/utilities/ui'

import { MembershipBand } from './MembershipBand'
import { AccessLabel } from './parts'
import { membersPanelClasses, t } from './styles'
import { ThemedShell } from './ThemedShell'

const named = <T extends object>(v: T | string | number | null | undefined): T | null => (v && typeof v === 'object' ? v : null)

/**
 * An episode or Field Note of a themed show, in the show's look (board 23). A members-only one read by the public comes
 * back without its body and audio, and shows the members' panel in their place.
 *
 * Not here (ROADMAP → Phase 7): "Sign in to WUWF" and "Playing from your members' feed" (7b to 7d), transcripts, related
 * archive items, Share Your Story (listening), podcast-app buttons.
 */
export function ThemedEpisodeView({
  post,
  show,
  theme,
  url,
  acknowledgments,
  independenceHref,
}: {
  post: Post
  show: Production
  theme: ShowTheme
  url: string
  acknowledgments: AcknowledgmentLine[]
  independenceHref: string | null
}) {
  const showPath = show.path!
  const isEpisode = post.format === 'audio'
  const audio = named(post.featuredAudio)
  const locked = post.membersOnly !== false && post.content == null
  const byline = (post.contributors ?? []).map((c) => named<Contributor>(c)?.name).filter(Boolean).join(' and ')
  const length = formatDuration(audio?.durationSeconds)

  return (
    <ThemedShell current="episode" hasArchive hasFieldNotes showPath={showPath} showTitle={show.title} theme={theme}>
      <PayloadRedirects disableNotFound url={url} />
      <article className={cn(t.container, 'max-w-[56rem] pt-10 md:pt-14')}>
        <nav aria-label="Breadcrumb" className={cn(t.label, 'text-base', t.muted)}>
          <Link className={t.link} href={isEpisode ? `${showPath}#episodes` : `${showPath}/field-notes`}>
            {isEpisode ? 'Episodes' : 'Field Notes'}
          </Link>
        </nav>
        <p className="mt-4 flex flex-wrap items-center gap-x-3">
          <AccessLabel membersOnly={post.membersOnly} />
          <span className={cn(t.label, 'text-base', t.muted)}>{[post.publishedAt ? formatLongDate(post.publishedAt) : null, length || null].filter(Boolean).join(' · ')}</span>
        </p>
        <h1 className={cn(t.display, 'mt-3 text-5xl md:text-7xl')}>{post.title}</h1>
        {post.dek && <p className={cn('mt-5 text-xl italic leading-relaxed', t.muted)}>{post.dek}</p>}
        {byline && <p className={cn('mt-4 text-base', t.muted)}>{byline}</p>}

        {post.featuredMedia?.length ? (
          <div className="mt-8">
            <FeaturedMedia blocks={post.featuredMedia} />
          </div>
        ) : null}

        {locked ? (
          <div className="mt-10">
            <MembersOnlyPanel classNames={membersPanelClasses} isEpisode={isEpisode} showHref={showPath} showTitle={show.title} supportHref={`${showPath}/support`} />
          </div>
        ) : (
          <>
            {audio && (
              <div className="mt-8">
                <AudioPlayerBlock audio={audio} blockType="audioPlayer" className="my-0" />
              </div>
            )}
            <RichText
              className="mt-10 font-(family-name:--font-show-body) prose-p:text-lg prose-p:leading-[1.9] prose-p:text-(--color-show-text) prose-a:text-(--color-show-accent) prose-headings:text-(--color-show-text) prose-strong:text-(--color-show-text) prose-blockquote:text-(--color-show-muted)"
              data={post.content}
              enableGutter={false}
            />
          </>
        )}

        {acknowledgments.length > 0 && (
          // The funder panel keeps the station's neutral look on purpose: never in a sponsor's or a show's colours.
          <div className="mt-12">
            <Acknowledgment independenceHref={independenceHref} lines={acknowledgments} />
          </div>
        )}
      </article>
      <MembershipBand heading={show.showSupport?.heading} intro={show.showSupport?.intro} showPath={showPath} showTitle={show.title} />
    </ThemedShell>
  )
}
