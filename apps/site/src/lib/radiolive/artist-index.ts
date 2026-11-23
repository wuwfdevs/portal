// The "All artists" index (hubs redesign, slice 4): every artist who has a published RadioLive show, with a search and an A to Z. Pure: the rules the page's filter and the loader share, so
// what the server draws and what the filter keeps agree. Nothing here reads a database or the request.

import { appearanceLine, appearances, type ArtistAppearance } from './arrange'

export interface IndexedArtist {
  slug: string
  name: string
  /** The letter the name files under: its first letter, without an accent, in capitals; "#" for a name that starts with anything else. */
  letter: string
  /** What the filter searches: the name in lower case without accents. */
  haystack: string
  /** "2 appearances · Oct. 29, 2026" for a show that is over; empty for an artist only on a coming bill. */
  line: string
}

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** The letter a name is filed under. */
export function letterOf(name: string): string {
  const first = fold(name).replace(/^[^a-z0-9]+/, '').charAt(0).toUpperCase()
  return /^[A-Z]$/.test(first) ? first : '#'
}

export interface PlayedShow {
  slug: string
  startsAt: string
  lineup: { slug: string; name: string }[]
}

/**
 * Every artist in the shows' lineups, A to Z by name (names that start with a number or a mark last). `past` are the shows that are over (an appearance counts only for them, as on the old page); an artist who is only on a
 * coming bill is listed with no line, because their page exists as soon as the show is published.
 */
export function indexArtists(shows: readonly PlayedShow[], now: Date): IndexedArtist[] {
  const over = shows.filter((s) => new Date(s.startsAt).getTime() < now.getTime())
  const seen = new Map<string, ArtistAppearance | null>()
  for (const a of appearances(over)) seen.set(a.slug, a)
  const names = new Map<string, string>()
  for (const s of shows) for (const a of s.lineup) if (!names.has(a.slug)) names.set(a.slug, a.name)
  return [...names.entries()]
    .map(([slug, name]): IndexedArtist => ({ slug, name, letter: letterOf(name), haystack: fold(name), line: seen.get(slug) ? appearanceLine(seen.get(slug)!) : '' }))
    .sort((a, b) => Number(a.letter === '#') - Number(b.letter === '#') || a.haystack.localeCompare(b.haystack) || a.slug.localeCompare(b.slug))
}

/** The letters that have an artist, A to Z with "#" last. */
export function lettersPresent(artists: readonly Pick<IndexedArtist, 'letter'>[]): string[] {
  return [...new Set(artists.map((a) => a.letter))].sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
}

/** The artists a search and a letter keep. A search matches any word-start or part of the name, so "bum" finds "Jesse Bumann"; no search and no letter keeps everyone. */
export function filterArtists<T extends Pick<IndexedArtist, 'letter' | 'haystack'>>(artists: readonly T[], query: string, letter: string | null): T[] {
  const q = fold(query)
  return artists.filter((a) => (letter === null || a.letter === letter) && (q === '' || a.haystack.includes(q)))
}
