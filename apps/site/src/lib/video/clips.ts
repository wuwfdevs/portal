// Short video (boards 7 and 8): the rules that need no database or framework. A clip is a short vertical video with captions,
// that belongs to a series ("After Isaias", "RadioLive moments") and points to the story or episode it came from.

/** A WebVTT caption file: the header, then at least one cue. Captions are required to publish a clip, so an empty or broken file is refused. */
export function validateVtt(value: string | null | undefined): true | string {
  const text = (value ?? '').replace(/^﻿/, '').trim()
  if (text === '') return 'Captions are required. Paste a WebVTT file (it starts with the word WEBVTT).'
  if (!/^WEBVTT(?:[ \t\n]|$)/.test(text)) return 'Captions must be a WebVTT file: the first line is the word WEBVTT.'
  if (!/\d{1,2}:\d{2}(?::\d{2})?\.\d{3}\s+-->\s+\d{1,2}:\d{2}(?::\d{2})?\.\d{3}/.test(text)) return 'The captions have no timed lines (like 00:00:01.000 --> 00:00:03.000).'
  return true
}

/** The captions as served: line endings tidied, header kept, ending in one newline. */
export function normalizeVtt(value: string): string {
  return value.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim() + '\n'
}

export interface ClipCard {
  slug: string
  title: string
  /** Newest first within a row is by this. */
  publishedAt: string | null
  series: { slug: string; title: string } | null
}

export interface ClipRow<T extends ClipCard> {
  /** The series' slug, or `more` for clips that belong to none. */
  key: string
  name: string
  items: T[]
}

export const NO_SERIES_ROW = { key: 'more', name: 'More video' } as const

const time = (iso: string | null): number => {
  const t = iso ? new Date(iso).getTime() : Number.NaN
  return Number.isNaN(t) ? 0 : t
}

/**
 * The board's rows: one per series, each newest first and cut to `perRow`, the rows ordered by their newest clip. Clips with no series
 * go in a final "More video" row, so nothing published is hidden. A row with nothing in it does not exist.
 */
export function groupIntoRows<T extends ClipCard>(clips: readonly T[], perRow = 8): ClipRow<T>[] {
  const newestFirst = [...clips].sort((a, b) => time(b.publishedAt) - time(a.publishedAt) || a.slug.localeCompare(b.slug))
  const rows = new Map<string, ClipRow<T>>()
  for (const clip of newestFirst) {
    const key = clip.series?.slug ?? NO_SERIES_ROW.key
    const row = rows.get(key) ?? { key, name: clip.series?.title ?? NO_SERIES_ROW.name, items: [] }
    if (row.items.length < perRow) row.items.push(clip)
    rows.set(key, row)
  }
  const all = [...rows.values()]
  return [...all.filter((r) => r.key !== NO_SERIES_ROW.key), ...all.filter((r) => r.key === NO_SERIES_ROW.key)]
}

/** The clip after `slug` in a newest-first list, wrapping to the first; null when the list has no other clip. */
export function nextClip<T extends { slug: string }>(list: readonly T[], slug: string): T | null {
  if (list.length < 2) return null
  const i = list.findIndex((c) => c.slug === slug)
  return list[(i + 1) % list.length] ?? null
}

/** "Read the story" unless the editor wrote their own label. */
export const ctaLabelOf = (label: string | null | undefined): string => label?.trim() || 'Read the story'
