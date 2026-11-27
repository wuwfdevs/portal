import { describe, expect, it } from 'vitest'

import type { ListeningHubEvent } from '@wuwf/portal-contracts'

import { canGather, gatherHint, gatherMode, gatherOptions, gatherPath, sessionsLine, sessionsOf, talkPath, talkVisible } from './talk'

const session = (publicId: string, queryPublicId: string | null, startsAt: string, seatsLeft: number | null = 5): ListeningHubEvent => ({
  publicId,
  title: 'Session',
  startsAt,
  endsAt: startsAt,
  placeName: 'Library',
  city: null,
  organizerLabel: null,
  seatsLeft,
  queryPublicId,
})
const flags = (canHostTable: boolean, canRequestHost: boolean) => ({ canHostTable, canRequestHost })

describe('gatherOptions and canGather', () => {
  it('read the question’s own flags, and anything but true is no', () => {
    expect(gatherOptions(flags(true, false))).toEqual({ table: true, request: false })
    expect(gatherOptions({ canHostTable: 'yes', canRequestHost: undefined } as never)).toEqual({ table: false, request: false })
    expect(canGather(flags(false, true))).toBe(true)
    expect(canGather(flags(false, false))).toBe(false)
  })
})

describe('gatherMode', () => {
  it('asks the reader to choose only when there is a choice', () => {
    expect(gatherMode({ table: true, request: true })).toBe('choose')
    expect(gatherMode({ table: true, request: false })).toBe('table')
    expect(gatherMode({ table: false, request: true })).toBe('request')
    expect(gatherMode({ table: false, request: false })).toBe('none')
  })
})

describe('paths', () => {
  it('puts the gather page under the question, and the talk-it-over part on the question’s page', () => {
    expect(gatherPath('abcdefghijkmnpqs')).toBe('/listens/abcdefghijkmnpqs/gather')
    expect(talkPath('abcdefghijkmnpqs')).toBe('/listens/abcdefghijkmnpqs#talk-it-over')
  })
})

describe('sessionsOf', () => {
  it('keeps one question’s sessions, soonest first, a full one last', () => {
    const hub = {
      events: [
        session('late', 'q1', '2026-12-20T16:00:00Z'),
        session('full', 'q1', '2026-12-01T16:00:00Z', 0),
        session('soon', 'q1', '2026-12-05T16:00:00Z'),
        session('other', 'q2', '2026-12-02T16:00:00Z'),
        session('loose', null, '2026-12-03T16:00:00Z'),
      ],
    }
    expect(sessionsOf(hub, 'q1').map((s) => s.publicId)).toEqual(['soon', 'late', 'full'])
    expect(sessionsOf(hub, 'nobody')).toEqual([])
  })
  it('is empty for a hub that sent no events, or none at all', () => {
    expect(sessionsOf({}, 'q1')).toEqual([])
    expect(sessionsOf(null, 'q1')).toEqual([])
  })
})

describe('talkVisible', () => {
  it('shows the part when there is a session or a way to gather, and not otherwise', () => {
    const one = [session('a', 'q1', '2026-12-05T16:00:00Z')]
    expect(talkVisible(flags(false, false), one)).toBe(true)
    expect(talkVisible(flags(true, false), [])).toBe(true)
    expect(talkVisible(flags(false, false), [])).toBe(false)
  })
})

describe('sessionsLine', () => {
  it('counts sessions as information, and says plainly when there are none', () => {
    expect(sessionsLine(1)).toBe('1 session coming up')
    expect(sessionsLine(3)).toBe('3 sessions coming up')
    expect(sessionsLine(0)).toBe('No sessions yet.')
  })
})

describe('gatherHint', () => {
  it('says what the reader will be asked next, and nothing when they cannot gather', () => {
    expect(gatherHint({ table: true, request: true })).toMatch(/bigger group/)
    expect(gatherHint({ table: true, request: false })).toMatch(/your own table/)
    expect(gatherHint({ table: false, request: true })).toMatch(/write back/)
    expect(gatherHint({ table: false, request: false })).toBeNull()
  })
})
