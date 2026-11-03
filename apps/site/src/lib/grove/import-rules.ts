// What the importer decides that the converter does not: where a story is filed when Grove did not say, and who is
// credited when the byline is missing or odd. These are the owner's rules (2026-11-03). Pure: no database.
//
//  - No primary section: file it under the section named by the first part of its path (`/local-arts/...` is Local Arts).
//  - No byline at all: credit "WUWF Staff", and say so, so an editor can correct it.
//  - A person with no profile page in Grove: still a contributor, just with no page to link to.
//  - Byline text beyond the named people: a fragment of a name we already have ("Dave", "S") adds nothing and is
//    dropped with a note; anything else is a person we would otherwise lose, so it becomes a contributor and is flagged.

import type { ConvertedStory, PersonRef } from './types'

export const DEFAULT_BYLINE = 'WUWF Staff'

export interface ImportPlan {
  section: { title: string; slug: string } | null
  people: PersonRef[]
  /** Codes for the import report; each names a decision that a person may want to review. */
  notes: { code: string; detail?: string }[]
}

export const firstSegment = (path: string): string => path.split('/').filter(Boolean)[0] ?? ''

export function titleFromSegment(segment: string): string {
  return segment
    .split('-')
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * The title each section's first path segment goes by: the title most stories under that segment carry, so a section
 * keeps its real name ("UWF News", "Local News | Featured") wherever Grove gave one.
 */
export function sectionTitlesBySegment(stories: readonly Pick<ConvertedStory, 'path' | 'section'>[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>()
  for (const s of stories) {
    if (!s.section) continue
    const seg = firstSegment(s.path)
    const m = counts.get(seg) ?? new Map<string, number>()
    m.set(s.section.title, (m.get(s.section.title) ?? 0) + 1)
    counts.set(seg, m)
  }
  const out = new Map<string, string>()
  for (const [seg, m] of counts) out.set(seg, [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0])
  return out
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** True when `text` is only part of a name already credited ("Dave" for "Dave Dunwoody", "S" for "Sandra Averhart"). */
const isNameFragment = (text: string, people: readonly PersonRef[]): boolean => {
  const t = norm(text)
  return !t || people.some((p) => norm(p.name).split(' ').some((w) => w === t || (t.length === 1 && w.startsWith(t))) || norm(p.name).includes(t))
}

export function planImport(story: Pick<ConvertedStory, 'path' | 'section' | 'byline'>, titles: ReadonlyMap<string, string>): ImportPlan {
  const notes: ImportPlan['notes'] = []
  const seg = firstSegment(story.path)

  let section: ImportPlan['section'] = null
  if (seg) {
    // The section's address segment is always the first part of the story's path, so the two never disagree.
    const title = story.section?.title ?? titles.get(seg) ?? titleFromSegment(seg)
    section = { title, slug: seg }
    if (!story.section) notes.push({ code: 'import.section-from-path', detail: `${seg} → ${title}` })
  }

  const people = story.byline.people.map((p) => ({ ...p }))
  const text = story.byline.text?.trim() ?? ''
  if (text) {
    if (isNameFragment(text, people)) notes.push({ code: 'import.byline-fragment-dropped', detail: text })
    else {
      people.push({ name: text })
      notes.push({ code: 'import.byline-text-became-person', detail: text })
    }
  }
  if (!people.length) {
    people.push({ name: DEFAULT_BYLINE })
    notes.push({ code: 'import.byline-defaulted', detail: DEFAULT_BYLINE })
  }
  return { section, people, notes }
}
