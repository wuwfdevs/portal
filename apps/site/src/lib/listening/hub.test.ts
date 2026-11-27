import { describe, expect, it } from 'vitest'

import type { ListeningHub, ListeningHubEvent, ListeningHubOpen } from '@wuwf/portal-contracts'

import { answeredBy, bandLabel, closesLabel, deskLabel, hubLayout, openMeta, outcomeDate, outcomeKicker } from './hub'

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

describe('the hub, grouped by question', () => {
  const open = (publicId: string, extra: Partial<ListeningHubOpen> = {}): ListeningHubOpen => ({
    publicId,
    title: `Question ${publicId}`,
    intro: '',
    askedBy: null,
    fromLabel: null,
    contextLabel: null,
    closesAt: null,
    allowTextAnswers: true,
    questionCount: 2,
    canHostTable: false,
    canRequestHost: false,
    ...extra,
  })
  const session = (publicId: string, queryPublicId: string | null, startsAt: string): ListeningHubEvent => ({
    publicId,
    title: 'Session',
    startsAt,
    endsAt: startsAt,
    placeName: 'Library',
    city: null,
    organizerLabel: null,
    seatsLeft: 5,
    queryPublicId,
  })
  const hub = (parts: Partial<ListeningHub>): ListeningHub => ({ open: [], answered: [], ...parts })

  it('makes a band of every open question, with its sessions soonest first', () => {
    const layout = hubLayout(
      hub({ open: [open('q1'), open('q2')], events: [session('late', 'q1', '2026-11-20T16:00:00Z'), session('soon', 'q1', '2026-11-15T16:00:00Z'), session('other', 'q2', '2026-11-18T16:00:00Z')] }),
    )
    expect(layout.bands.map((band) => [band.question.publicId, band.sessions.map((s) => s.publicId)])).toEqual([
      ['q1', ['soon', 'late']],
      ['q2', ['other']],
    ])
    expect(layout.sessions).toEqual([])
  })

  it('leaves a session whose question is not open in its own list', () => {
    const layout = hubLayout(hub({ open: [open('q1')], events: [session('s1', 'closed-one', '2026-11-15T16:00:00Z'), session('s2', null, '2026-11-16T16:00:00Z')] }))
    expect(layout.bands[0]?.sessions).toEqual([])
    expect(layout.sessions.map((s) => s.publicId)).toEqual(['s1', 's2'])
  })

  it('offers a table only for a question that invites one', () => {
    const layout = hubLayout(hub({ open: [open('q1', { canHostTable: true }), open('q2')] }))
    expect(layout.tables.map((q) => q.publicId)).toEqual(['q1'])
    expect(layout.questions).toHaveLength(2)
  })

  it('words a band’s eyebrow from the desk and the closing date', () => {
    expect(bandLabel({ contextLabel: 'After Isaias', askedBy: 'Leigh Ostrander', fromLabel: null, closesAt: '2026-11-30T20:00:00Z' })).toBe('After Isaias · Leigh Ostrander · open until Nov. 30')
    expect(bandLabel({ contextLabel: null, askedBy: null, fromLabel: null, closesAt: null })).toBe('open')
  })
})
