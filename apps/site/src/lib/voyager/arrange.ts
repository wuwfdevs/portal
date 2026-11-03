// What the Voyager hub derives from its stories and staff list. Pure, so every rule is tested without a database.

export interface StoryLike {
  id: string | number
  publishedAt?: string | null
}

/** The "Latest" rail: the newest stories after the featured one, never the featured story itself. */
export function latestRail<T extends StoryLike>(stories: readonly T[], featuredId: string | number | null, count: number): T[] {
  return stories.filter((s) => featuredId === null || String(s.id) !== String(featuredId)).slice(0, Math.max(0, count))
}

/** A staff member's role line: the role set for this term, else their own title, else nothing. */
export const staffRole = (role: string | null | undefined, title: string | null | undefined): string => role?.trim() || title?.trim() || ''

/** A byline as one line: "Marisol Tran", "A and B", "A, B and C". */
export function bylineText(names: readonly string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean)
  if (clean.length <= 1) return clean[0] ?? ''
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`
}

const SPELLED_OUT = new Set(['March', 'April', 'May', 'June', 'July'])

/** AP style for a month beside a day: March to July are written out, September is "Sept.", the rest are three letters and a period. */
export function apMonth(longName: string): string {
  if (SPELLED_OUT.has(longName)) return longName
  return longName === 'September' ? 'Sept.' : `${longName.slice(0, 3)}.`
}

/** The masthead date, written the way a newspaper prints it, in the station's time zone ("Friday, Oct. 30, 2026"). */
export function mastheadDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('weekday')}, ${apMonth(get('month'))} ${get('day')}, ${get('year')}`
}
