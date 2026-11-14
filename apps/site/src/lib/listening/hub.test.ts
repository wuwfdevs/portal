import { describe, expect, it } from 'vitest'

import type { ListeningHub, ListeningHubEvent, ListeningHubOpen } from '@wuwf/portal-contracts'

import { answeredBy, bandLabel, closesLabel, deskLabel, hubLayout, inviteMeta, openMeta, outcomeDate, outcomeKicker } from './hub'

describe('hub words', () => {
  it('says when a question closes, in the station day', () => {
    expect(closesLabel(null)).toBe('open')
    expect(closesLabel('not a date')).toBe('open')
    expect(closesLabel('2026-11-30T20:00:00Z')).toBe('open until Nov. 30')
    expect(closesLabel('2026-12-12T05:30:00Z')).toBe('open until Dec. 11')
    expect(closesLabel('2027-05-14T17:00:00Z')).toBe('open until May 14')
  })

  it('describes an open question without a count of answers', () => {
    const meta = openMeta({ questionCount: 2, allowTextAnswers: true, closesAt: '2026-12-12T20:00:00Z' })
    expect(meta).toBe('2 questions · voice or text · open until Dec. 12')
    expect(openMeta({ questionCount: 1, allowTextAnswers: false, closesAt: null })).toBe('1 question · voice · open')
    expect(meta).not.toMatch(/\d+ (people|responses|answers)/)
  })

  it("words the invitation's line with an upper bound on the time", () => {
    expect(inviteMeta({ questions: [{ maxDurationSeconds: 120 }, { maxDurationSeconds: 60 }], allowTextAnswers: false, closesAt: '2026-11-30T20:00:00Z' })).toBe(
      '2 questions · by voice · up to 3 minutes · open until Nov. 30',
    )
  })

  it('labels the desk from the series and the asker, else the desk', () => {
    expect(deskLabel({ contextLabel: 'Coastal Futures', askedBy: 'Leigh Ostrander', fromLabel: 'from the news desk' })).toBe('Coastal Futures · Leigh Ostrander')
    expect(deskLabel({ contextLabel: null, askedBy: null, fromLabel: 'from the news desk' })).toBe('from the news desk')
    expect(deskLabel({ contextLabel: null, askedBy: null, fromLabel: null })).toBeNull()
  })

  it('counts who answered, only when someone did', () => {
    expect(answeredBy(0)).toBeNull()
    expect(answeredBy(1)).toBe('One person answered')
    expect(answeredBy(1280)).toBe('1,280 people answered')
  })

  it('names an outcome and dates it without a timezone shift', () => {
    expect(outcomeKicker({ kind: 'story' }, 'After Isaias')).toBe('Story · After Isaias')
    expect(outcomeKicker({ kind: 'episode' }, null)).toBe('Episode')
    expect(outcomeDate('2026-10-23')).toBe('Oct 23, 2026')
    expect(outcomeDate('nope')).toBeNull()
  })
})

describe('the hub, grouped by campaign', () => {
  const open = (publicId: string, campaignPublicId: string | null): ListeningHubOpen => ({
    publicId,
    title: `Question ${publicId}`,
    intro: '',
    askedBy: null,
    fromLabel: null,
    contextLabel: null,
    closesAt: null,
    allowTextAnswers: true,
    questionCount: 2,
    campaignPublicId,
  })
  const session = (publicId: string, campaignPublicId: string | null, startsAt: string): ListeningHubEvent => ({
    publicId,
    title: 'Session',
    startsAt,
    endsAt: startsAt,
    placeName: 'Library',
    city: null,
    organizerLabel: null,
    seatsLeft: 5,
    campaignPublicId,
  })
  const season = { publicId: 'season', title: 'Season', question: 'What would make it easier to stay?', intro: '', ownerLabel: 'from WUWF', closesAt: '2026-12-20T20:00:00Z' }
  const storm = { publicId: 'storm', title: 'After Isaias', question: 'What did a contractor tell you?', intro: '', ownerLabel: null, closesAt: null }
  const hub = (parts: Partial<ListeningHub>): ListeningHub => ({ open: [], answered: [], ...parts })

  it('puts a campaign’s question, sessions and table in one band', () => {
    const layout = hubLayout(
      hub({
        campaigns: [season],
        open: [open('q1', 'season')],
        events: [session('late', 'season', '2026-11-20T16:00:00Z'), session('soon', 'season', '2026-11-15T16:00:00Z')],
        kitchenCampaigns: [{ publicId: 'season', title: 'Season', question: 'What would make it easier to stay?' }],
      }),
    )
    expect(layout.bands).toHaveLength(1)
    expect(layout.bands[0]?.question?.publicId).toBe('q1')
    expect(layout.bands[0]?.sessions.map((s) => s.publicId)).toEqual(['soon', 'late'])
    expect(layout.bands[0]?.table?.publicId).toBe('season')
    expect(layout.questions).toEqual([])
    expect(layout.sessions).toEqual([])
    expect(layout.tables).toEqual([])
  })

  it('keeps two campaigns apart', () => {
    const layout = hubLayout(
      hub({ campaigns: [season, storm], open: [open('q1', 'season'), open('q2', 'storm')], events: [session('s1', 'storm', '2026-11-18T16:00:00Z')] }),
    )
    expect(layout.bands.map((band) => [band.campaign.publicId, band.question?.publicId ?? null, band.sessions.length])).toEqual([
      ['season', 'q1', 0],
      ['storm', 'q2', 1],
    ])
  })

  it('leaves a question with no campaign in its own list, and makes no band for an empty campaign', () => {
    const layout = hubLayout(hub({ campaigns: [season], open: [open('solo', null)] }))
    expect(layout.bands).toEqual([])
    expect(layout.questions.map((q) => q.publicId)).toEqual(['solo'])
  })

  it('shows everything as before when the Portal sends no campaigns', () => {
    const layout = hubLayout(
      hub({ open: [open('q1', 'season')], events: [session('s1', 'season', '2026-11-15T16:00:00Z')], kitchenCampaigns: [{ publicId: 'season', title: 'Season', question: 'Q?' }] }),
    )
    expect(layout.bands).toEqual([])
    expect(layout.questions).toHaveLength(1)
    expect(layout.sessions).toHaveLength(1)
    expect(layout.tables).toHaveLength(1)
  })

  it('words the band’s label from the season, when it closes and who is asking', () => {
    expect(bandLabel(season)).toBe('Season · open until Dec. 20 · from WUWF')
    expect(bandLabel(storm)).toBe('After Isaias · open')
  })
})
