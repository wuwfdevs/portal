import type { ListeningHub } from '@wuwf/portal-contracts'

import type { HubLoad } from '@/lib/listening/load'

// A hub as the Portal might send it, for the Listens blocks' tests: one question that invites a table and a request to host, with a session of its own;
// a question that does not; a session whose question is not open; and one answered question with its outcome.
export const hub: ListeningHub = {
  open: [
    { publicId: 'q-campaign', title: 'What did the storm leave?', intro: '', askedBy: null, fromLabel: null, contextLabel: null, closesAt: null, allowTextAnswers: true, questionCount: 2, canHostTable: true, canRequestHost: true },
    { publicId: 'q-reporter', title: 'How is your insurance bill?', intro: '', askedBy: 'Leigh Ostrander', fromLabel: null, contextLabel: 'Coastal Futures', closesAt: null, allowTextAnswers: false, questionCount: 1, canHostTable: false, canRequestHost: false },
  ],
  answered: [
    {
      publicId: 'q-done',
      title: 'What would you ask the mayor?',
      askedBy: null,
      fromLabel: null,
      contextLabel: 'After Isaias',
      responseCount: 41,
      outcomes: [{ kind: 'story', title: 'The mayor answers', url: 'https://www.wuwf.org/news/2026-10-23/mayor', publishedAt: '2026-10-23', summary: 'Residents asked about drainage.' }],
    },
  ],
  events: [
    { publicId: 'e-band', title: 'Storm night', startsAt: '2026-12-05T01:00:00.000Z', endsAt: '2026-12-05T03:00:00.000Z', placeName: 'Library', city: 'Pensacola', organizerLabel: 'Friends of the Library', seatsLeft: 4, queryPublicId: 'q-campaign' },
    { publicId: 'e-own', title: 'Open table', startsAt: '2026-12-06T01:00:00.000Z', endsAt: '2026-12-06T03:00:00.000Z', placeName: 'Church hall', city: null, organizerLabel: null, seatsLeft: 0, queryPublicId: null },
  ],
}

export const ok: HubLoad = { kind: 'ok', hub }
export const empty: HubLoad = { kind: 'ok', hub: { open: [], answered: [] } }
export const notSetUp: HubLoad = { kind: 'not_set_up' }
export const failed: HubLoad = { kind: 'error' }
