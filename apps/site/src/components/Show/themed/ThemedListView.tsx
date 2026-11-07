import React from 'react'

import type { ThemedShowData } from '@/lib/shows/themed-load'
import { cn } from '@/utilities/ui'

import { MembershipBand } from './MembershipBand'
import { ArchiveCard, FieldNoteCard } from './parts'
import { t } from './styles'
import { ThemedShell } from './ThemedShell'

/** A themed show's Field Notes or its Archive, in full (board 21's "All articles" and "Browse all"). */
export function ThemedListView({ data, list }: { data: ThemedShowData; list: 'field-notes' | 'archive' }) {
  const { show, theme, fieldNotes, archive, totalFieldNotes, totalArchive } = data
  const path = show.path!
  const isNotes = list === 'field-notes'
  const shown = isNotes ? fieldNotes.length : archive.length
  const total = isNotes ? totalFieldNotes : totalArchive
  return (
    <ThemedShell current={list} hasArchive={totalArchive > 0} hasFieldNotes={totalFieldNotes > 0} showPath={path} showTitle={show.title} theme={theme}>
      <header className={cn(t.container, 'flex flex-col gap-4 py-14 md:py-20')}>
        <p className={t.eyebrow}>{isNotes ? 'Research and writing' : 'Primary sources'}</p>
        <h1 className={cn(t.display, 'text-6xl md:text-7xl')}>{isNotes ? 'Field Notes' : 'The Archive'}</h1>
        <p className={cn('max-w-[40rem] text-lg italic leading-relaxed', t.muted)}>
          {isNotes
            ? `Essays, interviews and primary-source readings from the making of ${show.title}.`
            : 'Documents, maps, photographs and recordings gathered in the course of investigation. Anyone can browse the catalogue; members open the full documents and audio.'}
        </p>
      </header>
      <section aria-label={isNotes ? 'Field Notes' : 'Archive items'} className={t.container}>
        {shown === 0 ? (
          <p className={cn('text-lg italic', t.muted)}>Nothing here yet.</p>
        ) : (
          <ul className={cn(t.grid, 'md:grid-cols-2 lg:grid-cols-3')}>
            {isNotes ? fieldNotes.map((n) => <FieldNoteCard key={n.id} note={n} />) : archive.map((a) => <ArchiveCard item={a} key={a.id} />)}
          </ul>
        )}
        {total > shown && <p className={cn('mt-4 text-sm', t.muted)}>Showing the {shown} newest of {total}.</p>}
      </section>
      <MembershipBand heading={show.showSupport?.heading} intro={show.showSupport?.intro} showPath={path} showTitle={show.title} />
    </ThemedShell>
  )
}
