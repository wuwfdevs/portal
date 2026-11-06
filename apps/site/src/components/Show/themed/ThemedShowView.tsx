import Link from 'next/link'
import React from 'react'

import { Acknowledgment } from '@/components/Acknowledgment'
import { Media } from '@/components/Media'
import RichText from '@/components/RichText'
import { AudioPlayerBlock } from '@/blocks/AudioPlayer/Component'
import { formatLongDate } from '@/lib/format'
import { audioOf } from '@/lib/shows/load'
import type { ThemedShowData } from '@/lib/shows/themed-load'
import { cn } from '@/utilities/ui'

import { MembershipBand } from './MembershipBand'
import { ArchiveCard, EpisodeCard, FieldNoteCard, SectionHeading } from './parts'
import { t } from './styles'
import { ThemedShell } from './ThemedShell'

/**
 * A themed show's home on wuwf.org (board 21): the show in its own look, its newest episode, every episode marked Free or
 * Members, its Field Notes and Archive, the membership band, then about the show and who funds it.
 *
 * Not here (ROADMAP → Phase 7): seasons, Share Your Story (the listening ask; listening is deferred), the members' feed and
 * "Already a member? Get your feed" (sign-in and member feeds, 7b to 7d), and podcast-app buttons.
 */
export function ThemedShowView({ data, independenceHref }: { data: ThemedShowData; independenceHref: string | null }) {
  const { show, theme, hosts, heroImage, episodes, totalEpisodes, fieldNotes, totalFieldNotes, archive, totalArchive, acknowledgments } = data
  const path = show.path!
  const latest = episodes[0]
  const latestAudio = latest && !latest.membersOnly ? audioOf(latest) : null
  const [firstNote, ...otherNotes] = fieldNotes

  return (
    <ThemedShell current="home" hasArchive={totalArchive > 0} hasFieldNotes={totalFieldNotes > 0} showPath={path} showTitle={show.title} theme={theme}>
      <header className="relative overflow-hidden">
        {heroImage && (
          <div aria-hidden className="absolute inset-0">
            <Media fill imgClassName="object-cover opacity-45" priority resource={heroImage} />
            <div className="absolute inset-0 bg-linear-to-r from-(--color-show-bg) via-(--color-show-bg)/80 to-transparent" />
          </div>
        )}
        <div className={cn(t.container, 'relative flex flex-col gap-5 py-16 md:py-28')}>
          {show.tagline && <p className={t.eyebrow}>{show.tagline}</p>}
          <h1 className={cn(t.display, 'max-w-[14ch] text-6xl md:text-8xl')}>{show.title}</h1>
          {show.summary && <p className={cn('max-w-[38rem] text-xl italic leading-relaxed', t.muted)}>{show.summary}</p>}
          {latest && (
            <div className="mt-4 flex max-w-[40rem] flex-col gap-3">
              <p className={cn(t.label, 'text-base', t.muted)}>
                Latest episode{latest.publishedAt ? ` · ${formatLongDate(latest.publishedAt)}` : ''}
              </p>
              <p className={cn(t.display, 'text-3xl')}>
                {latest.path ? (
                  <Link className="text-(--color-show-text) hover:text-(--color-show-accent) hover:no-underline" href={latest.path}>
                    {latest.title}
                  </Link>
                ) : (
                  latest.title
                )}
              </p>
              {latestAudio && <AudioPlayerBlock audio={latestAudio} blockType="audioPlayer" className="my-0" id="" title={latest.title} />}
              {latest.membersOnly && latest.path && (
                <Link className={cn(t.secondary, 'self-start')} href={latest.path}>
                  For WUWF members
                </Link>
              )}
            </div>
          )}
        </div>
      </header>

      <section aria-labelledby="episodes" className={cn(t.container, 'mt-16 scroll-mt-24')} id="episodes-section">
        <SectionHeading eyebrow={`${totalEpisodes} ${totalEpisodes === 1 ? 'episode' : 'episodes'}`} id="episodes" title="Episodes" />
        {episodes.length === 0 ? (
          <p className={cn('mt-6 text-lg italic', t.muted)}>The first episode is on its way.</p>
        ) : (
          <ol className={cn(t.grid, 'mt-8 md:grid-cols-2 lg:grid-cols-3')}>
            {episodes.map((e) => (
              <EpisodeCard episode={e} key={e.id} />
            ))}
          </ol>
        )}
        {totalEpisodes > episodes.length && <p className={cn('mt-4 text-sm', t.muted)}>Showing the {episodes.length} newest of {totalEpisodes} episodes.</p>}
      </section>

      {firstNote && (
        <section aria-labelledby="field-notes" className={cn(t.container, 'mt-20')}>
          <SectionHeading eyebrow="Research and writing" id="field-notes" more={totalFieldNotes > fieldNotes.length ? { href: `${path}/field-notes`, label: 'All Field Notes' } : null} title="Field Notes" />
          <ul className={cn(t.grid, 'mt-8 md:grid-cols-2')}>
            <FieldNoteCard featured note={firstNote} />
            {otherNotes.map((n) => (
              <FieldNoteCard key={n.id} note={n} />
            ))}
          </ul>
        </section>
      )}

      {archive.length > 0 && (
        <section aria-labelledby="archive" className={cn(t.container, 'mt-20')}>
          <SectionHeading eyebrow="Primary sources" id="archive" more={{ href: `${path}/archive`, label: 'Browse the Archive' }} title="The Archive" />
          <ul className={cn(t.grid, 'mt-8 md:grid-cols-2')}>
            {archive.map((item) => (
              <ArchiveCard item={item} key={item.id} />
            ))}
          </ul>
        </section>
      )}

      <MembershipBand heading={show.showSupport?.heading} intro={show.showSupport?.intro} showPath={path} showTitle={show.title} />

      <section aria-labelledby="about" className={cn(t.container, 'mt-16 grid scroll-mt-24 gap-10 md:grid-cols-[2fr_1fr]')} id="about-section">
        <div className="flex flex-col gap-4">
          <p className={t.eyebrow}>The show</p>
          <h2 className={cn(t.display, 'text-4xl')} id="about">
            About {show.title}
          </h2>
          {show.description && (
            <RichText
              className="prose-p:text-lg prose-p:leading-relaxed prose-p:text-(--color-show-text) prose-a:text-(--color-show-accent) prose-headings:text-(--color-show-text)"
              data={show.description}
              enableGutter={false}
            />
          )}
          {hosts.length > 0 && (
            <p className={cn('text-base', t.muted)}>
              Hosted by {hosts.map((h) => h.name).join(' and ')}. A production of WUWF Public Media.
            </p>
          )}
        </div>
        {acknowledgments.length > 0 && (
          // The funder panel keeps the station's neutral look on purpose: never in a sponsor's or a show's colours.
          <div className="self-start">
            <Acknowledgment independenceHref={independenceHref} lines={acknowledgments} />
          </div>
        )}
      </section>
    </ThemedShell>
  )
}
