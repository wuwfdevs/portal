// The words the broadcast schedule and the podcast directory had typed in their components before they became pages of sections (PAGE-BLOCKS.md phase 5).
// The migration that writes the pages reads them; nothing reads this file at request time.

export const SCHEDULE_WORDS = {
  eyebrow: 'WUWF 88.1 · Pensacola',
  title: 'Broadcast schedule',
  // The old line set "Listen live" in bold; a Feature line is plain text.
  line: 'Press Listen live at the top of any page to start the stream. It keeps playing while you browse.',
  scheduleTitle: 'Schedule',
  waysTitle: 'Other ways to listen',
  description: 'What is on WUWF 88.1, HD2 Classical and HD3, day by day.',
} as const

export const PODCASTS_WORDS = {
  eyebrow: 'WUWF originals',
  title: 'Podcasts made in Pensacola',
  line: 'Live music, Florida history and reporting from the Gulf Coast. Free wherever you listen.',
  showsTitle: 'All shows',
  latestTitle: 'Latest episodes',
  pageTitle: 'Podcasts',
  description: 'Podcasts made in Pensacola: live music, Florida history and reporting from the Gulf Coast.',
} as const
