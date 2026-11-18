import { formatLongDate } from '@/lib/format'
import { VOYAGER_BADGE_LABEL } from '@/lib/voyager/identity'

/**
 * What a "More like this" entry says about itself, decided here so the component only draws it (board 3a). Pure and tested.
 *
 * Nothing is invented: "Same topic" appears only when the two stories really share a topic, a series or a show, and the date says
 * "From" when the story is more than a year old, so an old story is never mistaken for new reporting.
 */

type Id = number | string

export type StoryFacts = {
  /** The story's topics (categories), with their titles. */
  topics: { id: Id; title: string }[]
  seriesId?: Id | null
  productionId?: Id | null
}

export type RelatedFacts = StoryFacts & {
  seriesTitle?: string | null
  productionTitle?: string | null
  format?: string | null
  /** Published by The Voyager (student newsroom). */
  voyager?: boolean
  publishedAt?: string | null
}

export type RelatedPresentation = {
  /** The small line above the title, or null when the story has nothing to say there. */
  kicker: string | null
  tone: 'topic' | 'show' | 'voyager'
  /** "Same show", "Same series" or "Same topic": only when true. */
  sameLabel: string | null
  /** "Oct 16, 2026", or "From Sep 22, 2025" for a story over a year old. Empty without a date. */
  date: string
  /** The date as `YYYY-MM-DD` for a `<time>` element, or null. */
  dateTime: string | null
  older: boolean
}

/** More than this long ago, a story is shown as "From <date>". */
export const OLDER_AFTER_DAYS = 365
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_TOPICS_IN_KICKER = 2

type Named = { id: Id; title?: string | null }

/** A populated relationship (an object with an id), or null for a bare id, null or nothing. */
export const namedRecord = (value: unknown): Named | null => (value && typeof value === 'object' ? (value as Named) : null)

/** What a story is about, as the "same topic / series / show" rule needs it. Takes loaded records; a bare id counts as nothing. */
export function storyFactsOf(story: { categories?: unknown[] | null; series?: unknown; production?: unknown }): StoryFacts {
  return {
    topics: (story.categories ?? []).flatMap((c) => {
      const topic = namedRecord(c)
      return topic?.title ? [{ id: topic.id, title: topic.title }] : []
    }),
    seriesId: namedRecord(story.series)?.id ?? null,
    productionId: namedRecord(story.production)?.id ?? null,
  }
}

const same = (a: Id | null | undefined, b: Id | null | undefined) => a != null && b != null && String(a) === String(b)

/** What `other` shares with `current`, most specific first (the same show, then series, then a topic). */
export function sharedLabel(current: StoryFacts, other: StoryFacts): 'Same show' | 'Same series' | 'Same topic' | null {
  if (same(current.productionId, other.productionId)) return 'Same show'
  if (same(current.seriesId, other.seriesId)) return 'Same series'
  const mine = new Set(current.topics.map((t) => String(t.id)))
  return other.topics.some((t) => mine.has(String(t.id))) ? 'Same topic' : null
}

/** True when the story was published more than a year before `now`. A missing or unreadable date is not "older": nothing is said. */
export function isOlder(publishedAt: string | null | undefined, now: Date): boolean {
  if (!publishedAt) return false
  const time = new Date(publishedAt).getTime()
  if (Number.isNaN(time)) return false
  return now.getTime() - time > OLDER_AFTER_DAYS * DAY_MS
}

export function presentRelated(current: StoryFacts, other: RelatedFacts, now: Date): RelatedPresentation {
  const mine = new Set(current.topics.map((t) => String(t.id)))
  // Topics this story shares with the one being read come first, so the kicker says why before it says anything else.
  const topics = [...other.topics].sort((a, b) => Number(mine.has(String(b.id))) - Number(mine.has(String(a.id))))

  let kicker: string | null = null
  let tone: RelatedPresentation['tone'] = 'topic'
  if (other.voyager) {
    kicker = VOYAGER_BADGE_LABEL
    tone = 'voyager'
  } else if (other.productionTitle) {
    kicker = `${other.format === 'audio' ? 'Episode' : 'Show'} · ${other.productionTitle}`
    tone = 'show'
  } else if (topics.length > 0) {
    kicker = topics.slice(0, MAX_TOPICS_IN_KICKER).map((t) => t.title).join(', ')
  } else if (other.seriesTitle) {
    kicker = `Series · ${other.seriesTitle}`
  }

  const older = isOlder(other.publishedAt, now)
  const longDate = formatLongDate(other.publishedAt)
  const published = other.publishedAt ? new Date(other.publishedAt) : null
  return {
    kicker,
    tone,
    sameLabel: sharedLabel(current, other),
    date: longDate && older ? `From ${longDate}` : longDate,
    dateTime: published && !Number.isNaN(published.getTime()) ? published.toISOString().slice(0, 10) : null,
    older,
  }
}
