import type { ListeningHub } from '@wuwf/portal-contracts'

import type { HubLoad } from '@/lib/listening/load'

// A hub as the Portal might send it, for the Listens blocks' tests: one campaign with its question, a session and a table; a reporter's own question; a
// session of its own; a standalone table; and one answered question with its outcome.
export const hub: ListeningHub = {
  open: [
    { publicId: 'q-campaign', title: 'What did the storm leave?', intro: '', askedBy: null, fromLabel: null, contextLabel: null, closesAt: null, allowTextAnswers: true, questionCount: 2, campaignPublicId: 'c-1' },
    { publicId: 'q-reporter', title: 'How is your insurance bill?', intro: '', askedBy: 'Leigh Ostrander', fromLabel: null, contextLabel: 'Coastal Futures', closesAt: null, allowTextAnswers: false, questionCount: 1, campaignPublicId: null },
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
    { publicId: 'e-band', title: 'Storm night', startsAt: '2026-12-05T01:00:00.000Z', endsAt: '2026-12-05T03:00:00.000Z', placeName: 'Library', city: 'Pensacola', organizerLabel: 'Friends of the Library', seatsLeft: 4, campaignPublicId: 'c-1' },
    { publicId: 'e-own', title: 'Open table', startsAt: '2026-12-06T01:00:00.000Z', endsAt: '2026-12-06T03:00:00.000Z', placeName: 'Church hall', city: null, organizerLabel: null, seatsLeft: 0, campaignPublicId: null },
  ],
  kitchenCampaigns: [
    { publicId: 'c-1', title: 'After the storm', question: 'What did the storm leave?' },
    { publicId: 'c-2', title: 'Rent', question: 'What does rent cost you?' },
  ],
  campaigns: [{ publicId: 'c-1', title: 'After the storm', question: 'What did the storm leave?', intro: 'A reporter is asking.', ownerLabel: 'from the WUWF News desk', closesAt: null }],
}

export const ok: HubLoad = { kind: 'ok', hub }
export const empty: HubLoad = { kind: 'ok', hub: { open: [], answered: [] } }
export const notSetUp: HubLoad = { kind: 'not_set_up' }
export const failed: HubLoad = { kind: 'error' }
