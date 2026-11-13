import { describe, expect, it } from 'vitest'

import type { ListeningRoomTable } from '@wuwf/portal-contracts'

import { canCallLastFive, lastCallSentence, roomCounts, roomSummary, sinceStart, tablesAskingForHelp, tablesOnPrompt } from './room'

const table = (number: number, state: ListeningRoomTable['state'], extra: Partial<ListeningRoomTable> = {}): ListeningRoomTable => ({ number, state, promptPosition: 1, helpRequested: false, facilitatorFirstName: null, ...extra })

describe('room counts and summary', () => {
  const tables = [table(1, 'recording'), table(2, 'recording', { helpRequested: true }), table(3, 'waiting'), table(4, 'agreed'), table(5, 'paused'), table(6, 'ended'), table(7, 'sent')]
  it('counts tables by what they are doing', () => {
    expect(roomCounts(tables)).toEqual({ total: 7, recording: 2, waiting: 2, paused: 1, done: 2, help: 1 })
  })
  it('says it in one line, leaving out what is zero', () => {
    expect(roomSummary(tables)).toBe('7 tables · 2 recording · 1 paused · 2 waiting · 2 finished · 1 asked for a hand')
    expect(roomSummary([table(1, 'recording')])).toBe('1 table · 1 recording')
  })
  it('lists the tables asking for a hand in order', () => {
    expect(tablesAskingForHelp([table(9, 'recording', { helpRequested: true }), table(2, 'paused', { helpRequested: true }), table(3, 'recording')]).map((t) => t.number)).toEqual([2, 9])
  })
})

describe('tablesOnPrompt', () => {
  it('counts tables on a prompt but not ones that have finished', () => {
    const tables = [table(1, 'recording', { promptPosition: 2 }), table(2, 'ended', { promptPosition: 2 }), table(3, 'paused', { promptPosition: 2 }), table(4, 'recording', { promptPosition: 1 })]
    expect(tablesOnPrompt(tables, 2)).toBe(2)
    expect(tablesOnPrompt(tables, 1)).toBe(1)
  })
})

describe('sinceStart', () => {
  const start = '2026-11-15T16:00:00Z'
  const end = '2026-11-15T19:00:00Z'
  it('says how long it has been going, or how long until it starts', () => {
    expect(sinceStart(start, end, new Date('2026-11-15T17:12:00Z'))).toBe('1 h 12 min in')
    expect(sinceStart(start, end, new Date('2026-11-15T16:30:00Z'))).toBe('30 min in')
    expect(sinceStart(start, end, new Date('2026-11-15T15:40:00Z'))).toBe('starts in 20 min')
    expect(sinceStart(start, end, new Date('2026-11-15T19:30:00Z'))).toBe('past its end time')
  })
  it('is empty for times it cannot read', () => {
    expect(sinceStart('x', 'y', new Date())).toBe('')
  })
})

describe('last call', () => {
  it('may be called once, while live', () => {
    expect(canCallLastFive({ lastCallAt: null, status: 'live' })).toBe(true)
    expect(canCallLastFive({ lastCallAt: null, status: 'scheduled' })).toBe(false)
    expect(canCallLastFive({ lastCallAt: '2026-11-15T18:00:00Z', status: 'live' })).toBe(false)
  })
  it('tells the room what it did', () => {
    expect(lastCallSentence(null, () => '')).toMatch(/Say it out loud too/)
    expect(lastCallSentence('2026-11-15T18:00:00Z', () => '1:00 p.m.')).toMatch(/called at 1:00 p\.m\./)
  })
})
