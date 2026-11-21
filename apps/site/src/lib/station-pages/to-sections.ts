// The broadcast schedule and the podcast directory as pages of sections (PAGE-BLOCKS.md, phase 5). Pure: the Listen live settings' "other ways to listen"
// cards in, two page records out. Used once, by the migration that writes the pages, and by its test, which checks that no word of the old pages is lost.
// The words come from `starter.ts` (typed in the components before) and from the cards (typed in the Listen live global before); only the arrangement is chosen here.

import { SectionsPage, clean, t, type PageRecord } from '@/lib/page-sets/sections-kit'

import { PODCASTS_WORDS, SCHEDULE_WORDS } from './starter'

export type { PageRecord } from '@/lib/page-sets/sections-kit'

export const SCHEDULE_PATH = '/schedule'
export const PODCASTS_PATH = '/podcasts'

/** One "other way to listen" card as the Listen live global stores it. */
export interface WayToListen {
  title?: string | null
  text?: string | null
  linkLabel?: string | null
  linkUrl?: string | null
}

/**
 * The two pages. A card keeps its link only when it has both a label and an address (the old page drew no link otherwise, and a Cards link with no label
 * would read "Read more"); a card with no title or text is not a card.
 */
export function stationPagesFrom(ways: readonly WayToListen[] | null | undefined): PageRecord[] {
  const schedule = new SectionsPage('schedule')
  schedule.add('hero', 'sectionFeature', 'plain', { label: SCHEDULE_WORDS.eyebrow, headline: SCHEDULE_WORDS.title, line: SCHEDULE_WORDS.line }, { variant: 'hero' })
  schedule.add('week', 'sectionBroadcastSchedule', 'grey', { heading: { title: SCHEDULE_WORDS.scheduleTitle } }, { anchor: 'schedule' })
  const cards = (ways ?? [])
    .filter((w) => t(w.title) && t(w.text))
    .map((w) => {
      const linked = Boolean(t(w.linkLabel) && t(w.linkUrl))
      return clean({ title: t(w.title), text: t(w.text), href: linked ? t(w.linkUrl) : undefined, linkLabel: linked ? t(w.linkLabel) : undefined })
    })
  if (cards.length > 0) schedule.add('ways', 'sectionCards', 'plain', { heading: { title: SCHEDULE_WORDS.waysTitle }, cards }, { anchor: 'ways' })

  const podcasts = new SectionsPage('podcasts')
  podcasts.add('hero', 'sectionFeature', 'plain', { label: PODCASTS_WORDS.eyebrow, headline: PODCASTS_WORDS.title, line: PODCASTS_WORDS.line }, { variant: 'hero' })
  podcasts.add('shows', 'sectionList', 'plain', { heading: { title: PODCASTS_WORDS.showsTitle }, source: 'shows' }, { anchor: 'shows', variant: 'tiles' })
  podcasts.add('latest', 'sectionList', 'grey', { heading: { title: PODCASTS_WORDS.latestTitle }, source: 'episodes', allShows: true, count: 12 }, { anchor: 'latest', variant: 'rows' })

  return [
    { slug: 'schedule', path: SCHEDULE_PATH, title: SCHEDULE_WORDS.title, navLabel: '', navOrder: 0, description: SCHEDULE_WORDS.description, sections: schedule.sections },
    { slug: 'podcasts', path: PODCASTS_PATH, title: PODCASTS_WORDS.pageTitle, navLabel: '', navOrder: 0, description: PODCASTS_WORDS.description, sections: podcasts.sections },
  ]
}
