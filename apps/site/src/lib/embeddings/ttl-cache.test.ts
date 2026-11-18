import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ttlCache } from './ttl-cache'

describe('ttlCache', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns an entry until its time is up, then it is gone without anyone asking for it', () => {
    const cache = ttlCache<number>(60 * 60 * 1000, 10)
    cache.set('a', 1)
    vi.advanceTimersByTime(59 * 60 * 1000)
    expect(cache.get('a')).toBe(1)
    vi.advanceTimersByTime(2 * 60 * 1000)
    expect(cache.size).toBe(0) // removed by its own timer, not merely ignored on a later read
    expect(cache.get('a')).toBeUndefined()
  })

  it('starts the clock again when a key is set again', () => {
    const cache = ttlCache<number>(1000, 10)
    cache.set('a', 1)
    vi.advanceTimersByTime(800)
    cache.set('a', 2)
    vi.advanceTimersByTime(800)
    expect(cache.get('a')).toBe(2)
    vi.advanceTimersByTime(300)
    expect(cache.size).toBe(0)
  })

  it('drops the oldest entry when full', () => {
    const cache = ttlCache<number>(1000, 2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
    expect(cache.size).toBe(2)
  })

  it('does not keep a process alive', () => {
    const cache = ttlCache<number>(1000, 2)
    const spy = vi.spyOn(globalThis, 'setTimeout')
    cache.set('a', 1)
    const timer = spy.mock.results[0]?.value as { hasRef?: () => boolean } | undefined
    expect(timer?.hasRef?.() ?? false).toBe(false)
    spy.mockRestore()
  })
})
