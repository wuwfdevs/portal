import { describe, expect, it, vi } from 'vitest'

import type { ListeningTablePrompt } from '@wuwf/portal-contracts'

import { failure } from './results'
import {
  SEGMENT_CUT_SECONDS,
  SegmentQueue,
  canStartAnotherSegment,
  formatClock,
  helpSentence,
  neighbourPosition,
  promptAt,
  promptLabel,
  segmentIsDue,
  sendPercent,
  suggestedTimeLabel,
  tableScreen,
  type SegmentSteps,
} from './table'

const UPLOAD = { url: 'https://storage.example/u', method: 'PUT' as const, headers: { 'content-type': 'audio/webm' }, expiresAt: '2026-11-15T20:00:00Z' }
const blob = (text = 'audio') => new Blob([text], { type: 'audio/webm' })
const segment = (seq: number) => ({ seq, blob: blob(`seg${seq}`), durationMs: 1000, contentType: 'audio/webm' })

function steps(overrides: Partial<SegmentSteps> = {}): SegmentSteps & { order: string[] } {
  const order: string[] = []
  return {
    order,
    reserve: vi.fn(async ({ seq }) => {
      order.push(`reserve${seq}`)
      return { ok: true as const, upload: UPLOAD }
    }),
    put: vi.fn(async () => {
      order.push('put')
      return true
    }),
    complete: vi.fn(async ({ seq }) => {
      order.push(`complete${seq}`)
      return { ok: true as const }
    }),
    ...overrides,
  }
}

describe('tableScreen', () => {
  it('maps the Portal state to what the phone shows', () => {
    expect(tableScreen({ state: 'waiting' })).toBe('before')
    expect(tableScreen({ state: 'agreed' })).toBe('before')
    expect(tableScreen({ state: 'recording' })).toBe('recording')
    expect(tableScreen({ state: 'paused' })).toBe('paused')
    expect(tableScreen({ state: 'ended' })).toBe('finishing')
    expect(tableScreen({ state: 'sent' })).toBe('done')
  })
})

describe('formatClock', () => {
  it('shows minutes and seconds, adding hours past one', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(3600 + 5 * 60 + 9)).toBe('1:05:09')
  })
  it('never shows a negative or non-numeric time', () => {
    expect(formatClock(-4)).toBe('0:00')
    expect(formatClock(Number.NaN)).toBe('0:00')
  })
})

describe('prompts', () => {
  const prompts: ListeningTablePrompt[] = [
    { position: 0, kind: 'intro', text: 'Names', hint: null, suggestedSeconds: 120 },
    { position: 1, kind: 'question', text: 'The question', hint: 'h', suggestedSeconds: 600 },
    { position: 2, kind: 'prompt', text: 'A', hint: null, suggestedSeconds: null },
    { position: 3, kind: 'prompt', text: 'B', hint: null, suggestedSeconds: 480 },
  ]
  it('labels the intro, the question and the numbered prompts', () => {
    expect(promptLabel(prompts, prompts[0]!)).toBe('First, go around the table')
    expect(promptLabel(prompts, prompts[1]!)).toBe('The question')
    expect(promptLabel(prompts, prompts[2]!)).toBe('Prompt 1 of 2')
    expect(promptLabel(prompts, prompts[3]!)).toBe('Prompt 2 of 2')
  })
  it('finds a prompt by position, or the nearest earlier one', () => {
    expect(promptAt(prompts, 2)?.text).toBe('A')
    expect(promptAt(prompts, 9)?.text).toBe('B')
    expect(promptAt([], 0)).toBeNull()
  })
  it('steps to the neighbouring position and stops at either end', () => {
    expect(neighbourPosition(prompts, 1, 1)).toBe(2)
    expect(neighbourPosition(prompts, 1, -1)).toBe(0)
    expect(neighbourPosition(prompts, 0, -1)).toBeNull()
    expect(neighbourPosition(prompts, 3, 1)).toBeNull()
  })
  it('words a suggested time', () => {
    expect(suggestedTimeLabel(120)).toBe('2 minutes')
    expect(suggestedTimeLabel(30)).toBe('1 minute')
    expect(suggestedTimeLabel(null)).toBeNull()
  })
})

describe('helpSentence', () => {
  it('says help is coming only when a console is watching', () => {
    expect(helpSentence({ helpRequested: false, helpAvailable: true })).toEqual({ button: 'Need a hand', note: null })
    expect(helpSentence({ helpRequested: true, helpAvailable: true }).button).toBe('Help is coming')
  })
  it('flags the request without promising help when nobody is watching', () => {
    const said = helpSentence({ helpRequested: true, helpAvailable: false })
    expect(said.button).not.toBe('Help is coming')
    expect(said.note).toMatch(/ask someone at the front/)
  })
})

describe('segments', () => {
  it('cuts before the Portal limit of five minutes', () => {
    expect(SEGMENT_CUT_SECONDS).toBeLessThan(300)
    expect(segmentIsDue(SEGMENT_CUT_SECONDS * 1000 - 1)).toBe(false)
    expect(segmentIsDue(SEGMENT_CUT_SECONDS * 1000)).toBe(true)
  })
  it('stops at the Portal limit of 100 segments', () => {
    expect(canStartAnotherSegment(99)).toBe(true)
    expect(canStartAnotherSegment(100)).toBe(false)
  })
})

describe('SegmentQueue', () => {
  it('reserves, puts, then completes each segment, oldest first', async () => {
    const s = steps()
    const queue = new SegmentQueue(s)
    queue.enqueue(segment(1))
    queue.enqueue(segment(0))
    await queue.drain()
    expect(s.order).toEqual(['reserve0', 'put', 'complete0', 'reserve1', 'put', 'complete1'])
    expect(queue.progress()).toEqual({ uploaded: 2, total: 2, failing: false })
    expect(queue.waiting()).toEqual([])
  })

  it('keeps a segment queued when the upload fails, and sends it on the next try', async () => {
    const put = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    const s = steps({ put })
    const queue = new SegmentQueue(s)
    queue.enqueue(segment(0))
    await queue.drain()
    expect(queue.waiting()).toEqual([0])
    expect(queue.progress().failing).toBe(true)
    expect(queue.error()).toMatch(/safe on this phone/)
    await queue.drain()
    expect(queue.waiting()).toEqual([])
    expect(queue.error()).toBeNull()
  })

  it('does not mark a segment sent until the Portal confirms it', async () => {
    const complete = vi.fn(async () => failure('unavailable'))
    const queue = new SegmentQueue(steps({ complete }))
    queue.enqueue(segment(0))
    await queue.drain()
    expect(queue.progress().uploaded).toBe(0)
    expect(queue.waiting()).toEqual([0])
  })

  it('stops at the first failure so a later segment is never sent ahead of an earlier one', async () => {
    const reserve = vi.fn(async ({ seq }: { seq: number }) => (seq === 0 ? failure('rate_limited') : { ok: true as const, upload: UPLOAD }))
    const s = steps({ reserve })
    const queue = new SegmentQueue(s)
    queue.enqueue(segment(0))
    queue.enqueue(segment(1))
    await queue.drain()
    expect(reserve).toHaveBeenCalledTimes(1)
    expect(queue.waiting()).toEqual([0, 1])
  })

  it('drops a segment the Portal already holds without sending its bytes', async () => {
    const reserve = vi.fn(async () => ({ ok: true as const, alreadyUploaded: true as const }))
    const s = steps({ reserve })
    const queue = new SegmentQueue(s)
    queue.enqueue(segment(0))
    await queue.drain()
    expect(s.put).not.toHaveBeenCalled()
    expect(queue.progress().uploaded).toBe(1)
  })

  it('ignores a segment already known to be uploaded, and a duplicate', async () => {
    const s = steps()
    const queue = new SegmentQueue(s, [0])
    queue.enqueue(segment(0))
    queue.enqueue(segment(1))
    queue.enqueue(segment(1))
    expect(queue.waiting()).toEqual([1])
  })

  it('runs one drain at a time', async () => {
    const s = steps()
    const queue = new SegmentQueue(s)
    queue.enqueue(segment(0))
    await Promise.all([queue.drain(), queue.drain()])
    expect(s.reserve).toHaveBeenCalledTimes(1)
  })
})

describe('sendPercent', () => {
  it('is 100 only when nothing is waiting', () => {
    expect(sendPercent({ uploaded: 0, total: 0, failing: false })).toBe(0)
    expect(sendPercent({ uploaded: 3, total: 4, failing: false })).toBe(75)
    expect(sendPercent({ uploaded: 99, total: 100, failing: false })).toBe(99)
    expect(sendPercent({ uploaded: 4, total: 4, failing: false })).toBe(100)
  })
})
