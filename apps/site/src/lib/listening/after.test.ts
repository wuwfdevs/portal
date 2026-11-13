import { describe, expect, it } from 'vitest'

import {
  activeSpeakers,
  afterStage,
  clockFromMs,
  lineAt,
  markFacilitator,
  markLine,
  marksHeading,
  marksPayload,
  mergeSpeakers,
  renameSpeaker,
  speakersPayload,
  unmarkLine,
  unmergeSpeaker,
  visibleLines,
  voiceName,
  waitingSentence,
  type SpeakerEdit,
} from './after'

const speaker = (id: string, extra: Partial<SpeakerEdit> = {}): SpeakerEdit => ({ id, label: `Voice ${id}`, name: '', isFacilitator: false, mergedInto: null, firstHeardMs: 0, sharePercent: 10, ...extra })

describe('clockFromMs', () => {
  it('shows minutes and seconds, and hours past one', () => {
    expect(clockFromMs(0)).toBe('0:00')
    expect(clockFromMs(65_000)).toBe('1:05')
    expect(clockFromMs((3600 + 5 * 60 + 9) * 1000)).toBe('1:05:09')
    expect(clockFromMs(-5)).toBe('0:00')
  })
})

describe('naming voices', () => {
  it('shows a name, or the voice number when none was given', () => {
    const list = renameSpeaker([speaker('1'), speaker('2')], '1', 'Rosa')
    expect(voiceName(list, '1')).toBe('Rosa')
    expect(voiceName(list, '2')).toBe('Voice 2')
    expect(voiceName(list, null)).toBe('Unknown voice')
  })
  it('leaves a voice unnamed when the name is blank: that is allowed', () => {
    expect(speakersPayload([speaker('1', { name: '   ' })])[0]!.name).toBeNull()
  })
  it('lets only one voice be the facilitator, and a second tap takes it back', () => {
    const first = markFacilitator([speaker('1'), speaker('2')], '1')
    expect(first.map((s) => s.isFacilitator)).toEqual([true, false])
    const moved = markFacilitator(first, '2')
    expect(moved.map((s) => s.isFacilitator)).toEqual([false, true])
    expect(markFacilitator(moved, '2').map((s) => s.isFacilitator)).toEqual([false, false])
  })
})

describe('merging voices', () => {
  it('folds one voice into another and shows it under that name', () => {
    const list = mergeSpeakers(renameSpeaker([speaker('1'), speaker('2')], '1', 'Rosa'), '2', '1')
    expect(activeSpeakers(list).map((s) => s.id)).toEqual(['1'])
    expect(voiceName(list, '2')).toBe('Rosa')
  })
  it('never merges a voice into itself or into one already folded away', () => {
    const list = [speaker('1'), speaker('2'), speaker('3')]
    expect(mergeSpeakers(list, '1', '1')).toBe(list)
    const folded = mergeSpeakers(list, '2', '1')
    expect(mergeSpeakers(folded, '3', '2')).toBe(folded)
  })
  it('moves whatever was folded into a voice along with it, so there is no chain', () => {
    const merged = mergeSpeakers(mergeSpeakers([speaker('1'), speaker('2'), speaker('3')], '2', '1'), '1', '3')
    expect(merged.find((s) => s.id === '2')!.mergedInto).toBe('3')
    expect(merged.find((s) => s.id === '1')!.mergedInto).toBe('3')
  })
  it('takes a merged voice off the facilitator when it is folded away', () => {
    const list = markFacilitator([speaker('1'), speaker('2')], '2')
    expect(mergeSpeakers(list, '2', '1').find((s) => s.id === '2')!.isFacilitator).toBe(false)
  })
  it('can be undone', () => {
    const list = mergeSpeakers([speaker('1'), speaker('2')], '2', '1')
    expect(activeSpeakers(unmergeSpeaker(list, '2')).length).toBe(2)
  })
})

describe('marking lines', () => {
  it('keeps marks in order and changes the tag of a line marked twice', () => {
    let marks = markLine([], 5000, 'Cost')
    marks = markLine(marks, 1000, null)
    marks = markLine(marks, 5000, 'Housing')
    expect(marks).toEqual([
      { startMs: 1000, tag: null },
      { startMs: 5000, tag: 'Housing' },
    ])
  })
  it('removes a mark, and sends only where it starts and its tag, never the words', () => {
    const marks = unmarkLine(markLine(markLine([], 1000, 'A'), 2000, 'B'), 1000)
    expect(marksPayload(marks)).toEqual([{ startMs: 2000, tag: 'B' }])
    expect(Object.keys(marksPayload(marks)[0]!)).toEqual(['startMs', 'tag'])
  })
  it('says how many are marked', () => {
    expect(marksHeading(0)).toBe('What mattered')
    expect(marksHeading(3)).toBe('What mattered · 3')
  })
})

describe('lines', () => {
  const lines = [0, 300_000, 600_000, 900_000].map((startMs) => ({ startMs, endMs: startMs + 1000, text: `t${startMs}`, speakerId: null }))
  it('shows the first minutes, or all', () => {
    expect(visibleLines(lines, 10).map((l) => l.startMs)).toEqual([0, 300_000])
    expect(visibleLines(lines, null)).toHaveLength(4)
  })
  it('finds a line by where it starts', () => {
    expect(lineAt(lines, 600_000)?.text).toBe('t600000')
    expect(lineAt(lines, 7)).toBeUndefined()
  })
})

describe('afterStage', () => {
  it('can be worked on only once there is a transcript and it has not been sent', () => {
    expect(afterStage({ status: 'complete', transcriptReady: false })).toBe('waiting')
    expect(afterStage({ status: 'ready', transcriptReady: true })).toBe('working')
    expect(afterStage({ status: 'named', transcriptReady: true })).toBe('working')
    expect(afterStage({ status: 'sent', transcriptReady: true })).toBe('sent')
  })
  it('says where a conversation without a transcript is', () => {
    expect(waitingSentence('uploading')).toMatch(/still reaching WUWF/)
    expect(waitingSentence('transcribing')).toMatch(/being made/)
  })
})
