import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NowNext } from '@/lib/live/schedule'

import { useNowNext } from './useNowNext'

// The hook behind the player bar and the Listen live page. Both findings from review on PR 339: the refresh timer must
// plan from the latest answer (not the one captured at mount), the shown time must move on at a program's end without a
// request, and a channel switch must never show the previous channel's program.

const FM = 'eed45825-935f-4185-8b47-059fcc96a6a6'
const HD2 = 'ad7c1f78-645e-4cf2-8b38-88f8519b7464'
const T0 = Date.parse('2026-11-07T05:50:00Z')
const echoes: NowNext = {
  onNow: { name: 'Echoes', start: '2026-11-07T04:00:00.000Z', end: '2026-11-07T05:59:00.000Z', link: null },
  upNext: { name: 'BBC World', start: '2026-11-07T06:00:00.000Z', end: '2026-11-07T11:00:00.000Z', link: null },
}
const classical: NowNext = {
  onNow: { name: 'Classical 24', start: '2026-11-06T06:00:00.000Z', end: '2026-11-07T05:59:59.000Z', link: null },
  upNext: null,
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

/** Lets the hook's fetch promise and its state update settle. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })
}

describe('useNowNext', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(T0)
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('for the bar (no first answer): shows the fetched program, then drops it at its end even when the refresh fails', async () => {
    fetchMock.mockResolvedValueOnce(json(echoes)).mockResolvedValue(json({ error: 'down' }, 503))
    const { result } = renderHook(() => useNowNext(FM))
    await flush()
    expect(result.current.onNow?.name).toBe('Echoes')

    // 11:59 p.m. passes: Echoes is over and BBC World has not started.
    await act(async () => {
      vi.advanceTimersByTime(9 * 60_000 + 1_000)
    })
    expect(result.current.onNow).toBeNull()
    expect(result.current.upNext?.name).toBe('BBC World')

    // Midnight: BBC World is on, from the answer already held, though every refresh has failed.
    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current.onNow?.name).toBe('BBC World')
  })

  it('asks again just after the program ends, not only on the five-minute poll', async () => {
    fetchMock.mockResolvedValue(json(echoes))
    renderHook(() => useNowNext(FM))
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Echoes ends 9 minutes after T0. First the five-minute poll, at 5:00 ...
    await act(async () => {
      vi.advanceTimersByTime(5 * 60_000 + 1_000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await flush()
    // ... then, planned from the latest answer, 5 seconds after Echoes ends (9:05). Planned from the answer captured at
    // mount (empty), the next ask would only come with the next poll, at 10:00.
    await act(async () => {
      vi.advanceTimersByTime(4 * 60_000 + 5_000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('on a channel switch shows the new channel’s own first answer, never the previous program, while its fetch fails', async () => {
    fetchMock.mockResolvedValueOnce(json(echoes)).mockResolvedValue(json({ error: 'down' }, 503))
    const { result, rerender } = renderHook(({ id, initial }) => useNowNext(id, initial), {
      initialProps: { id: FM, initial: echoes as NowNext | undefined },
    })
    await flush()
    expect(result.current.onNow?.name).toBe('Echoes')

    rerender({ id: HD2, initial: classical })
    await flush()
    expect(result.current.onNow?.name).toBe('Classical 24')

    // A channel with no first answer shows nothing, not 88.1's program.
    rerender({ id: '75d8ec9d-cfc5-45b8-aec9-5bdeb6cd1fd4', initial: undefined })
    await flush()
    expect(result.current).toEqual({ onNow: null, upNext: null })
  })
})
