// The WUWF Listens hub as a page of sections (PAGE-BLOCKS.md, phase 5; reshaped when the query became the core record, 2026-11-27: a card for each question with one
// action, and a list of what is coming up). Pure: the words, arranged into a page record. Used by the migrations that write the page, and by its test, which checks that no
// word is lost. Nothing reads this file at request time: the words are the sections' from then on, and an editor changes them in the admin.
//
// What the hub shows (the questions, the sessions, what came of them) is the Portal's, drawn by the Listens blocks; only the words around it are here.

import { SectionsPage, type PageRecord } from '@/lib/page-sets/sections-kit'

export type { PageRecord } from '@/lib/page-sets/sections-kit'

export const LISTENS_PATH = '/listens'

export const HUB_WORDS = {
  label: 'WUWF Listens',
  headline: 'Your questions shape our reporting.',
  line: 'Ask us something. Suggest a story. Answer a reporter. Sit down with your neighbors. A person at WUWF reads every word. Your answers go to WUWF for editorial review and are never published automatically.',
  nowTitle: 'What we’re listening for right now',
  nowIntro: 'Every question is open to everyone. Answer on your own, or talk it over with other people.',
  empty: 'No reporter has a question open right now. Check back soon.',
  sessionsTitle: 'Coming up',
  sessionsIntro: 'Sessions where people talk a question over together. Seats are limited, and each table is recorded only with everyone’s agreement.',
  // The cards on the home page (Open questions, cards layout); the hub itself has a band for every question.
  reportersTitle: 'A reporter would like to hear from you',
  reportersIntro: 'One reporter, one story, a few minutes by voice or in writing.',
  reportersVoiceOnly: 'One reporter, one story, a few minutes by voice.',
  outcomesTitle: 'You asked. Here’s what came of it.',
  title: 'WUWF Listens',
  description: 'Answer a reporter’s question by voice or in writing, and see what came of the answers.',
} as const

/** The hub, in the listens set (the only page of it). Hosting is on each question's own page, so nothing here is a page for it. */
export function listensPages(): PageRecord[] {
  const hub = new SectionsPage('listens')
  hub.add('ask', 'sectionAskWuwf', 'accent', { label: HUB_WORDS.label, headline: HUB_WORDS.headline, line: HUB_WORDS.line, jumpLinks: false })
  hub.add(
    'now',
    'sectionListeningOpen',
    'plain',
    { heading: { title: HUB_WORDS.nowTitle, intro: HUB_WORDS.nowIntro }, emptyText: HUB_WORDS.empty },
    { anchor: 'now', variant: 'campaigns' },
  )
  hub.add('sessions', 'sectionListeningSessions', 'plain', { heading: { title: HUB_WORDS.sessionsTitle, intro: HUB_WORDS.sessionsIntro } }, { anchor: 'coming-up', variant: 'sessions' })
  hub.add('outcomes', 'sectionListeningOutcomes', 'dark', { heading: { title: HUB_WORDS.outcomesTitle } }, { anchor: 'came-of-it' })

  return [
    { slug: 'listens', path: LISTENS_PATH, title: HUB_WORDS.title, navLabel: HUB_WORDS.title, navOrder: 1, description: HUB_WORDS.description, sections: hub.sections },
  ]
}
