import { describe, expect, it } from 'vitest'

import { answeredBy, closesLabel, deskLabel, inviteMeta, openMeta, outcomeDate, outcomeKicker } from './hub'

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
