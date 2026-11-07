'use client'

import { useEffect, useRef, useState } from 'react'

import { currentPrograms, EMPTY_NOW_NEXT, nextChange, type NowNext } from '@/lib/live/schedule'

const POLL_MS = 5 * 60_000
/** How long after a program boundary to ask again, so Cadence has moved on. */
const AFTER_CHANGE_MS = 5_000

/**
 * "On now" and "Up next" for one channel, kept current: fetched from the site (never from Cadence directly), refreshed
 * just after the current program ends and every few minutes while the page is visible.
 *
 * Two clocks, kept apart: the refresh timer always plans from the latest answer (a ref, not the value captured when the
 * effect started), and the displayed time moves on at each program boundary by itself, so a program is never shown
 * after its end even when a refresh fails. Each answer belongs to its channel: switching channels shows that channel's
 * server-rendered answer (or nothing) until its own fetch returns, never the previous channel's program.
 */
export function useNowNext(cadenceChannelId: string | null, initial?: NowNext): NowNext {
  const [entry, setEntry] = useState<{ id: string | null; data: NowNext }>({ id: cadenceChannelId, data: initial ?? EMPTY_NOW_NEXT })
  const data = entry.id === cadenceChannelId ? entry.data : (initial ?? EMPTY_NOW_NEXT)
  const [now, setNow] = useState(() => Date.now())

  const latest = useRef(data)
  useEffect(() => {
    latest.current = data
  }, [data])

  // Refresh from the site: now, after each boundary of the latest answer, every few minutes, and on returning to the tab.
  useEffect(() => {
    if (!cadenceChannelId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const plan = () => {
      clearTimeout(timer)
      const t = Date.now()
      const change = nextChange(latest.current, t)
      const wait = change ? Math.min(Math.max(change - t + AFTER_CHANGE_MS, AFTER_CHANGE_MS), POLL_MS) : POLL_MS
      timer = setTimeout(() => {
        if (document.visibilityState === 'visible') void load()
        else plan()
      }, wait)
    }

    const load = async () => {
      try {
        const res = await fetch(`/listen/now?channel=${encodeURIComponent(cadenceChannelId)}`)
        if (res.ok && !cancelled) {
          const json = (await res.json()) as NowNext
          const next = { onNow: json.onNow ?? null, upNext: json.upNext ?? null }
          latest.current = next
          setEntry({ id: cadenceChannelId, data: next })
        }
      } catch {
        // Keep the answer we have; the boundary clock below still drops a program that has ended.
      }
      if (!cancelled) plan()
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
  }, [cadenceChannelId])

  // The displayed time: catch up at once when a new answer arrives on a stale clock, then move on at the next boundary
  // of the answer shown, independent of any request.
  useEffect(() => {
    const t = Date.now()
    const change = nextChange(data, t)
    const wait = t - now > 1_000 ? 0 : change === null ? null : change - t + 250
    if (wait === null) return
    const timer = setTimeout(() => setNow(Date.now()), wait)
    return () => clearTimeout(timer)
  }, [data, now])

  return cadenceChannelId ? currentPrograms(data, now) : EMPTY_NOW_NEXT
}
