'use client'

import { useEffect, useState } from 'react'

import { currentPrograms, EMPTY_NOW_NEXT, nextChange, type NowNext } from '@/lib/live/schedule'

const POLL_MS = 5 * 60_000

/**
 * "On now" and "Up next" for one channel, kept current: fetched from the site (never from Cadence directly), refreshed
 * when the current program ends and every few minutes while the page is visible, and re-checked against the clock
 * so a program is never shown after its end time, even if a refresh fails.
 */
export function useNowNext(cadenceChannelId: string | null, initial?: NowNext): NowNext {
  const [data, setData] = useState<NowNext>(initial ?? EMPTY_NOW_NEXT)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!cadenceChannelId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const load = async () => {
      try {
        const res = await fetch(`/listen/now?channel=${encodeURIComponent(cadenceChannelId)}`)
        if (res.ok && !cancelled) {
          const json = (await res.json()) as NowNext
          setData({ onNow: json.onNow ?? null, upNext: json.upNext ?? null })
        }
      } catch {
        // Keep what we have; the clock check below still drops a program that has ended.
      }
      if (!cancelled) schedule()
    }

    const schedule = () => {
      clearTimeout(timer)
      const t = Date.now()
      setNow(t)
      const change = nextChange(data, t)
      // A few seconds past the change, so the schedule has moved on; never longer than the poll.
      const wait = change ? Math.min(Math.max(change - t + 5_000, 5_000), POLL_MS) : POLL_MS
      timer = setTimeout(() => {
        if (document.visibilityState === 'visible') void load()
        else schedule()
      }, wait)
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }

    void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // `data` is read for the next timer only; reloading on every change would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadenceChannelId])

  return cadenceChannelId ? currentPrograms(data, now) : EMPTY_NOW_NEXT
}
