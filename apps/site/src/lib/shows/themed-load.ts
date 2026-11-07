import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { ArchiveItem, Media, Post, Season, SupportPage } from '@/payload-types'

import { CARD_FIELDS, type HomeStory } from '@/lib/homepage/load'

import { EPISODE_FIELDS, episodesOf, loadShowByPath, type Episode, type ShowData } from './load'
import { currentSeason, groupBySeason, type SeasonGroup } from './seasons'
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
  /** Every episode (up to 300), grouped by season: newest season first, each in episode order. */
  seasonGroups: SeasonGroup<Season, Episode>[]
  /** The season holding the newest episode ("Now airing"), with its picture when it has one. */
  current: { season: Season; image: Media | null } | null
}

export const MAX_THEMED_EPISODES = 300

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
  const [notes, archive, allEpisodes, seasons] = await Promise.all([
    payload.find({ collection: 'posts', depth: 1, draft: false, limit: limits.notes, overrideAccess: false, select: NOTE_FIELDS, sort: '-publishedAt', where: notesOf(base.show.id) as never }),
    payload.find({ collection: 'archive-items', depth: 0, draft: false, limit: limits.archive, overrideAccess: false, sort: ['-sortDate', '-createdAt'], where: { production: { equals: base.show.id } } }),
    payload.find({ collection: 'posts', depth: 1, draft: false, limit: MAX_THEMED_EPISODES, overrideAccess: false, select: EPISODE_FIELDS, sort: '-publishedAt', where: episodesOf(base.show.id) as never }),
    payload.find({ collection: 'seasons', depth: 1, draft: false, limit: 100, overrideAccess: false, pagination: false, sort: '-number', where: { production: { equals: base.show.id } } }),
  ])
  const episodes = allEpisodes.docs as Episode[]
  const now = currentSeason(seasons.docs, episodes)
  return { ...base, theme, fieldNotes: notes.docs as FieldNote[], totalFieldNotes: notes.totalDocs, archive: archive.docs, totalArchive: archive.totalDocs, seasonGroups: groupBySeason(seasons.docs, episodes), current: now ? { season: now, image: now.image && typeof now.image === 'object' ? now.image : null } : null }
})

export type StationLevel = NonNullable<SupportPage['levels']>[number]

/** The station's membership levels, from the Support page settings, for a show's support page. Never the show's own. */
export const loadStationLevels = cache(async (): Promise<StationLevel[]> => {
  const payload = await getPayload({ config: configPromise })
  const page = await payload.findGlobal({ slug: 'support-page', depth: 0, overrideAccess: false }).catch(() => null)
  return page?.levels ?? []
})

/** The station's qualifying level for members' listening, in words, from the Support page settings; null when unset. */
export const loadMembersListeningLevel = cache(async (): Promise<string | null> => {
  const payload = await getPayload({ config: configPromise })
  const page = await payload.findGlobal({ slug: 'support-page', depth: 0, overrideAccess: false }).catch(() => null)
  return page?.membersListeningLevel?.trim() || null
})
