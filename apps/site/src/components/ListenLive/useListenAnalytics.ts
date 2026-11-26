'use client'

import { useEffect, useRef } from 'react'

import { analytics } from '@/lib/analytics/dispatch'
import type { AudioPercent, ListenRef } from '@/lib/analytics/events'
import { listenRefOf, listenSeconds, marksReached, sameListen } from '@/lib/analytics/listening'

import type { PlayerMode, PlayerStatus } from './PlayerProvider'

type Open = { ref: ListenRef; startedAt: number; marks: Set<AudioPercent> }

/**
 * The player's listening events (`lib/analytics/listening.ts` has the rules): `listen_started` at the first sound, `listen_stopped` with how
 * long it ran, and `audio_progressed` at each quarter of on-demand audio. Called once, by `PlayerProvider`; reads what the player shows and
 * never changes it. Everything goes through `analytics.track`.
 */
export function useListenAnalytics({
  mode,
  channelKey,
  trackId,
  status,
  position,
  duration,
}: {
  mode: PlayerMode
  channelKey: string | null
  trackId: string | null
  status: PlayerStatus
  position: number
  duration: number
}): void {
  const open = useRef<Open | null>(null)
  const ref = listenRefOf(mode, channelKey, trackId)

  const stop = () => {
    const listen = open.current
    if (!listen) return
    open.current = null
    analytics.track({ name: 'listen_stopped', ...listen.ref, seconds: listenSeconds(listen.startedAt, Date.now()) })
  }

  // Start, stop and switch, from the player's status and what it holds.
  useEffect(() => {
    const listen = open.current
    if (listen && !sameListen(listen.ref, ref)) stop()
    if (status === 'playing' && ref && !open.current) {
      open.current = { ref, startedAt: Date.now(), marks: new Set() }
      analytics.track({ name: 'listen_started', ...ref })
    } else if (status === 'paused' || status === 'idle' || status === 'error') stop()
    // `stop` reads only refs; the reference is compared by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, ref?.source, ref?.stream_id])

  // Quarter marks of on-demand audio, once per listen each.
  useEffect(() => {
    const listen = open.current
    if (!listen || listen.ref.source !== 'on_demand') return
    for (const percent of marksReached(position, duration, listen.marks)) {
      listen.marks.add(percent)
      analytics.track({ name: 'audio_progressed', audio_id: listen.ref.stream_id, percent })
    }
  }, [position, duration])

  // Leaving the site ends the listen; so does the player going away.
  useEffect(() => {
    window.addEventListener('pagehide', stop)
    return () => {
      window.removeEventListener('pagehide', stop)
      stop()
    }
  }, [])
}
