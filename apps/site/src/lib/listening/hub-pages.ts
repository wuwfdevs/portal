// The WUWF Listens hub and the host form's page as pages of sections (PAGE-BLOCKS.md, phase 5). Pure: the words that were typed in the hub's component and
// the host page, arranged into two page records. Used once, by the migration that writes the pages, and by its test, which checks that no word of the old
// pages is lost. Nothing reads this file at request time: the words are the sections' from then on, and an editor changes them in the admin.
//
// What the hub shows (the questions, the sessions, the tables, what came of them) is the Portal's, drawn by the Listens blocks; only the words around it are here.

import { SectionsPage, type PageRecord } from '@/lib/page-sets/sections-kit'

export type { PageRecord } from '@/lib/page-sets/sections-kit'

export const LISTENS_PATH = '/listens'
export const LISTENS_HOST_PATH = '/listens/host'

export const HUB_WORDS = {
  label: 'WUWF Listens',
  headline: 'Your questions shape our reporting.',
  line: 'Ask us something. Suggest a story. Answer a reporter. Sit down with your neighbors. A person at WUWF reads every word. Your answers go to WUWF for editorial review and are never published automatically.',
  nowTitle: 'What we’re listening for right now',
  nowIntro: 'Each question is open for a while, and there is more than one way to answer it. A person at WUWF reads every answer.',
  empty: 'No reporter has a question open right now. Check back soon.',
  sessionsTitle: 'Join a listening session',
  sessionsIntro: 'Sit down with your neighbors at a table, talk about a question that matters here, and a WUWF journalist listens to what was said.',
  // The cards on the home page (Open questions, cards layout); the hub itself has a band for every question.
  reportersTitle: 'A reporter would like to hear from you',
  reportersIntro: 'One reporter, one story, a few minutes by voice or in writing.',
  reportersVoiceOnly: 'One reporter, one story, a few minutes by voice.',
  outcomesTitle: 'You asked. Here’s what came of it.',
  title: 'WUWF Listens',
  description: 'Answer a reporter’s question by voice or in writing, and see what came of the answers.',
} as const

export const HOST_WORDS = {
  label: 'Host a session',
  headline: 'Bring a listening session to your table.',
  line: 'Invite a few people to talk about something that matters where you live, or open it to anyone. You can ask for a WUWF journalist to join. A person at WUWF reads every request and will write back within a week.',
  back: '← WUWF Listens',
  title: 'Host a listening session',
  description: 'Ask to bring a WUWF listening session to your table, by invitation or open to the public.',
} as const

/** The two pages, in the listens set. */
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
  hub.add('sessions', 'sectionListeningSessions', 'plain', { heading: { title: HUB_WORDS.sessionsTitle, intro: HUB_WORDS.sessionsIntro } }, { anchor: 'join-a-session', variant: 'sessions' })
  hub.add('outcomes', 'sectionListeningOutcomes', 'dark', { heading: { title: HUB_WORDS.outcomesTitle } }, { anchor: 'came-of-it' })

  const host = new SectionsPage('listens-host')
  host.add('hero', 'sectionFeature', 'plain', { label: HOST_WORDS.label, headline: HOST_WORDS.headline, line: HOST_WORDS.line, actions: [{ label: HOST_WORDS.back, href: LISTENS_PATH }] }, { variant: 'hero' })
  host.add('form', 'sectionHostForm', 'plain', {}, { anchor: 'request' })

  return [
    { slug: 'listens', path: LISTENS_PATH, title: HUB_WORDS.title, navLabel: HUB_WORDS.title, navOrder: 1, description: HUB_WORDS.description, sections: hub.sections },
    { slug: 'listens-host', path: LISTENS_HOST_PATH, title: HOST_WORDS.title, navLabel: 'Host a session', navOrder: 2, description: HOST_WORDS.description, sections: host.sections },
  ]
}
