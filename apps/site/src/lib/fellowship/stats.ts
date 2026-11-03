// The one line under a fellowship's title: what has been made through it. Pure.

export interface FellowshipCounts {
  stories: number
  episodes: number
  videos: number
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

/** "14 stories · 3 podcast episodes · 9 videos · since July 2026". A kind with none is left out, and nothing at all gives null. */
export function statsLine(counts: FellowshipCounts, since: string | null | undefined): string | null {
  const parts: string[] = []
  if (counts.stories > 0) parts.push(plural(counts.stories, 'story', 'stories'))
  if (counts.episodes > 0) parts.push(plural(counts.episodes, 'podcast episode'))
  if (counts.videos > 0) parts.push(plural(counts.videos, 'video'))
  const month = since ? monthYear(since) : null
  if (month) parts.push(`since ${month}`)
  return parts.length > 0 ? parts.join(' · ') : null
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "July 2026" from an ISO date or timestamp, read as the calendar day it names (no time zone shift). */
export function monthYear(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(iso)
  if (!m) return null
  const month = Number(m[2])
  return month >= 1 && month <= 12 ? `${MONTHS[month - 1]} ${m[1]}` : null
}
