import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { ArchiveItem, Post, SupportPage } from '@/payload-types'

import { CARD_FIELDS, type HomeStory } from '@/lib/homepage/load'

import { loadShowByPath, type ShowData } from './load'
import { showThemeOf, type ShowTheme } from './themes'

/** A Field Note: a story that belongs to the show and is not an episode. */
export type FieldNote = HomeStory & Pick<Post, 'fieldNoteKind' | 'membersOnly' | 'contributors'>

const NOTE_FIELDS = { ...CARD_FIELDS, fieldNoteKind: true, membersOnly: true, contributors: true } as const

export interface ThemedShowData extends ShowData {
  theme: ShowTheme
  fieldNotes: FieldNote[]
  totalFieldNotes: number
  archive: ArchiveItem[]
  totalArchive: number
}

const notesOf = (showId: string | number) => ({ and: [{ production: { equals: showId } }, { format: { not_equals: 'audio' } }] })

/**
 * A themed show with what its pages list: the show data, then its Field Notes and Archive, newest first. Null when the path
 * is not a show, the show has no theme, or it is a syndicated program. Every read goes through access control.
 */
export const loadThemedShow = cache(async (path: string, limits: { notes: number; archive: number } = { notes: 5, archive: 4 }): Promise<ThemedShowData | null> => {
  const base = await loadShowByPath(path)
  const theme = base && base.show.kind === 'original' ? showThemeOf(base.show.theme) : null
  if (!base || !theme) return null
  const payload = await getPayload({ config: configPromise })
  const [notes, archive] = await Promise.all([
    payload.find({ collection: 'posts', depth: 1, draft: false, limit: limits.notes, overrideAccess: false, select: NOTE_FIELDS, sort: '-publishedAt', where: notesOf(base.show.id) as never }),
    payload.find({ collection: 'archive-items', depth: 0, draft: false, limit: limits.archive, overrideAccess: false, sort: ['-sortDate', '-createdAt'], where: { production: { equals: base.show.id } } }),
  ])
  return { ...base, theme, fieldNotes: notes.docs as FieldNote[], totalFieldNotes: notes.totalDocs, archive: archive.docs, totalArchive: archive.totalDocs }
})

export type StationLevel = NonNullable<SupportPage['levels']>[number]

/** The station's membership levels, from the Support page settings, for a show's support page. Never the show's own. */
export const loadStationLevels = cache(async (): Promise<StationLevel[]> => {
  const payload = await getPayload({ config: configPromise })
  const page = await payload.findGlobal({ slug: 'support-page', depth: 0, overrideAccess: false }).catch(() => null)
  return page?.levels ?? []
})
