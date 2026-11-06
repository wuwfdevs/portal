import Link from 'next/link'
import React from 'react'

import type { ArchiveItem, Contributor } from '@/payload-types'

import { ARCHIVE_KINDS } from '@/lib/shows/archive-kinds'
import { formatDuration, formatLongDate } from '@/lib/format'
import { audioOf, type Episode } from '@/lib/shows/load'
import { episodeLabel } from '@/lib/shows/seasons'
import type { FieldNote } from '@/lib/shows/themed-load'
import { cn } from '@/utilities/ui'

import { t } from './styles'

const named = <T extends object>(v: T | string | number | null | undefined): T | null => (v && typeof v === 'object' ? v : null)

/** Free or Members, as the boards label every episode, note and archive item. Words, never colour alone. */
export function AccessLabel({ membersOnly }: { membersOnly?: boolean | null }) {
  return membersOnly ? <span className={t.badgeMembers}>Members</span> : <span className={t.badgeFree}>Free</span>
}

export function SectionHeading({ id, eyebrow, title, more }: { id: string; eyebrow: string; title: string; more?: { href: string; label: string } | null }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4 border-b pb-4', t.rule)}>
      <div className="flex flex-col gap-1">
        <p className={t.eyebrow}>{eyebrow}</p>
        <h2 className={cn(t.display, 'text-4xl md:text-5xl')} id={id}>
          {title}
        </h2>
      </div>
      {more && (
        <Link className={cn(t.label, 'inline-flex min-h-11 items-center text-base', t.link)} href={more.href}>
          {more.label} →
        </Link>
      )}
    </div>
  )
}

/** An episode card: the whole card is the link (board 21's episode grid). */
export function EpisodeCard({ episode }: { episode: Episode }) {
  const length = formatDuration(audioOf(episode)?.durationSeconds)
  return (
    <li className={t.card}>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <AccessLabel membersOnly={episode.membersOnly} />
        <span className={cn(t.label, 'text-sm', t.muted)}>{[episodeLabel(episode.episodeNumber, episode.episodeType), episode.publishedAt ? formatLongDate(episode.publishedAt) : null, length || null].filter(Boolean).join(' · ')}</span>
      </p>
      <h3 className={cn(t.display, 'text-2xl')}>
        {episode.path ? (
          <Link className="text-(--color-show-text) after:absolute after:inset-0 hover:text-(--color-show-accent) hover:no-underline" href={episode.path}>
            {episode.title}
          </Link>
        ) : (
          episode.title
        )}
      </h3>
      {episode.meta?.description && <p className={cn('text-base italic leading-relaxed', t.muted)}>{episode.meta.description}</p>}
    </li>
  )
}

const NOTE_LABEL: Record<string, string> = { essay: 'Essay', 'primary-source': 'Primary source', analysis: 'Analysis', interview: 'Interview', 'deep-dive': 'Deep dive' }

export function FieldNoteCard({ note, featured = false }: { note: FieldNote; featured?: boolean }) {
  const by = (note.contributors ?? []).map((c) => named<Contributor>(c)?.name).filter(Boolean).join(' and ')
  return (
    <li className={cn(t.card, featured && 'md:row-span-2 md:p-8')}>
      <p className="flex flex-wrap items-center gap-x-2">
        <AccessLabel membersOnly={note.membersOnly} />
        {note.fieldNoteKind && <span className={cn(t.label, 'text-sm', t.muted)}>· {NOTE_LABEL[note.fieldNoteKind] ?? note.fieldNoteKind}</span>}
      </p>
      <h3 className={cn(t.display, featured ? 'text-3xl md:text-4xl' : 'text-xl')}>
        {note.path ? (
          <Link className="text-(--color-show-text) after:absolute after:inset-0 hover:text-(--color-show-accent) hover:no-underline" href={note.path}>
            {note.title}
          </Link>
        ) : (
          note.title
        )}
      </h3>
      {featured && note.meta?.description && <p className={cn('text-base italic leading-relaxed', t.muted)}>{note.meta.description}</p>}
      <p className={cn('text-sm', t.muted)}>{[by || null, note.publishedAt ? formatLongDate(note.publishedAt) : null].filter(Boolean).join(' · ')}</p>
    </li>
  )
}

const KIND_LABEL = Object.fromEntries(ARCHIVE_KINDS.map((k) => [k.value, k.label.replace(/ \(PDF\)$/, '')]))

/**
 * An archive item. The catalogue entry is public; the file opens only when it is free (a members' item comes back with no
 * address for its file, so there is nothing to link to).
 */
export function ArchiveCard({ item }: { item: ArchiveItem }) {
  const episode = named<{ title?: string | null; path?: string | null }>(item.episode as never)
  const fileHref = !item.membersOnly && item.url ? item.url : null
  return (
    <li className={t.card}>
      <p className="flex flex-wrap items-center gap-x-2">
        <AccessLabel membersOnly={item.membersOnly} />
        <span className={cn(t.label, 'text-sm', t.muted)}>· {KIND_LABEL[item.kind] ?? item.kind}</span>
      </p>
      <h3 className={cn(t.display, 'text-xl')}>
        {fileHref ? (
          <a className="text-(--color-show-text) after:absolute after:inset-0 hover:text-(--color-show-accent) hover:no-underline" href={fileHref}>
            {item.title}
          </a>
        ) : (
          item.title
        )}
      </h3>
      {item.source && <p className={cn('text-sm italic', t.muted)}>{item.source}</p>}
      {item.description && <p className={cn('text-sm leading-relaxed', t.muted)}>{item.description}</p>}
      {episode?.title && <p className={cn(t.label, 'text-sm', t.muted)}>Cited in: {episode.title}</p>}
      {item.membersOnly && <p className={cn('text-sm', t.muted)}>The full item is for WUWF members.</p>}
    </li>
  )
}
