'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import type { LiveChannel } from '@/lib/live/channels'
import { clampSeek, type Track } from '@/lib/player/track'

import { useListenAnalytics } from './useListenAnalytics'

/**
 * The site's one player (board 26). One <audio> element for the whole site, in the layout, so it keeps playing as the reader
 * moves between pages. It plays two kinds of thing, one at a time: a live stream (a channel) or a piece of on-demand audio (a
 * track). Every play button on the site, in the header, on a card, on a story, hands its audio to this player; none has an
 * element of its own, so there is never a second voice. Nothing plays until the reader presses play: no autoplay, and nothing is
 * requested before then (preload="none").
 *
 * A live stream resumes by reconnecting, so the listener hears the station now, not a buffer. A track resumes where it stopped.
 */

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'
export type PlayerMode = 'live' | 'track'

/** How far the skip buttons move, in seconds. */
export const SKIP_SECONDS = 15

type Core = {
  channels: LiveChannel[]
  /** What the player is set to play: the live stream, or the track. */
  mode: PlayerMode
  /** The selected channel (also while a track is playing: it is what "Listen live" would start). Null when no channels are set. */
  current: LiveChannel | null
  /** The on-demand audio the player holds, whether playing or paused. Only meaningful in track mode. */
  track: Track | null
  status: PlayerStatus
  /** True once the reader has pressed play on anything: the bar shows from then on. */
  started: boolean
  volume: number
  play: (key?: string) => void
  pause: () => void
  toggle: (key?: string) => void
  select: (key: string) => void
  /** Play this track, or pause it if it is the one playing, or resume it if it is the one paused. */
  toggleTrack: (track: Track) => void
  /** Move to a time (seconds) in the track. */
  seek: (seconds: number) => void
  /** Move the track by this many seconds, back or forward. */
  skip: (seconds: number) => void
  setVolume: (v: number) => void
  close: () => void
}

/** The player as the live-stream controls see it: always has a channel, and reads as idle while a track holds the player. */
export type LivePlayerState = Omit<Core, 'current'> & { current: LiveChannel }

const PlayerContext = createContext<Core | null>(null)
const ProgressContext = createContext<{ position: number; duration: number }>({ position: 0, duration: 0 })

/** The whole player, tracks included. Null outside the layout's provider. */
export function usePlayer(): Core | null {
  return useContext(PlayerContext)
}

/** The track's position and length. Separate from `usePlayer` because it changes several times a second: only the bar reads it. */
export function usePlayerProgress(): { position: number; duration: number } {
  return useContext(ProgressContext)
}

/**
 * The live player, for the Listen live button, its panel and the schedule. Null when no channels are set, so those screens show
 * nothing. While a track holds the player the stream is not playing, so it reads as idle: the button says "Listen live" and pressing
 * it switches the player back to the station.
 */
export function useLivePlayer(): LivePlayerState | null {
  const core = useContext(PlayerContext)
  return useMemo(() => {
    if (!core || !core.current) return null
    const live = core.mode === 'live'
    return { ...core, current: core.current, status: live ? core.status : 'idle', started: live && core.started }
  }, [core])
}

const isActive = (status: PlayerStatus) => status === 'playing' || status === 'loading'

export const PlayerProvider: React.FC<{ channels: LiveChannel[]; children: React.ReactNode }> = ({ channels, children }) => {
  const audio = useRef<HTMLAudioElement>(null)
  const [key, setKey] = useState(channels[0]?.key ?? '')
  const [mode, setMode] = useState<PlayerMode>('live')
  const [track, setTrack] = useState<Track | null>(null)
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [started, setStarted] = useState(false)
  const [volume, setVolumeState] = useState(0.8)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const current = channels.find((c) => c.key === key) ?? channels[0] ?? null

  // Listening events (listen started and stopped, on-demand quarter marks): read from what the player shows, never changing it.
  useListenAnalytics({ mode, channelKey: current?.key ?? null, trackId: track?.id ?? null, status, position, duration })

  // The media events fire outside React's render, so they read the latest mode here rather than a stale closure.
  const modeRef = useRef<PlayerMode>('live')
  const trackRef = useRef<Track | null>(null)
  const switchTo = useCallback((next: PlayerMode, nextTrack: Track | null) => {
    modeRef.current = next
    trackRef.current = nextTrack
    setMode(next)
    setTrack(nextTrack)
  }, [])

  /** What to do when `play()` is refused or fails. A play that was itself replaced by another (an AbortError) is not a failure. */
  const fail = useCallback((error: DOMException) => {
    if (error?.name !== 'AbortError') setStatus('error')
  }, [])

  const play = useCallback(
    (k?: string) => {
      const el = audio.current
      const target = channels.find((c) => c.key === (k ?? key)) ?? channels[0]
      if (!el || !target) return
      switchTo('live', null)
      setKey(target.key)
      setStarted(true)
      setStatus('loading')
      // Always (re)connect: a live stream resumed from its buffer would be minutes behind the station.
      el.src = target.streamUrl
      el.volume = volume
      el.play().catch(fail)
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: target.name, artist: 'WUWF Public Media', album: 'Live' })
      }
    },
    [channels, key, volume, switchTo, fail],
  )

  const pause = useCallback(() => {
    const el = audio.current
    if (!el) return
    el.pause()
    if (modeRef.current === 'live') {
      // Drop the connection: a paused live stream otherwise keeps downloading.
      el.removeAttribute('src')
      el.load()
    }
    setStatus('paused')
  }, [])

  const toggle = useCallback(
    (k?: string) => {
      const same = !k || k === key
      if (modeRef.current === 'live' && same && isActive(status)) pause()
      else play(k)
    },
    [key, status, pause, play],
  )

  const select = useCallback(
    (k: string) => {
      // Choosing a channel while a track plays only changes what "Listen live" will start; it must not cut the track off.
      if (modeRef.current === 'live' && isActive(status)) play(k)
      else setKey(k)
    },
    [status, play],
  )

  const toggleTrack = useCallback(
    (next: Track) => {
      const el = audio.current
      if (!el) return
      const same = modeRef.current === 'track' && trackRef.current?.id === next.id
      if (same && isActive(status)) {
        pause()
        return
      }
      setStarted(true)
      setStatus('loading')
      el.volume = volume
      if (same && status !== 'error') {
        // Resume where it stopped; one that finished starts again from the top.
        if (el.ended) el.currentTime = 0
      } else {
        switchTo('track', next)
        setPosition(0)
        setDuration(next.durationSeconds ?? 0)
        el.src = next.src
      }
      el.play().catch(fail)
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: next.title, artist: next.credit ?? 'WUWF Public Media', album: 'WUWF' })
      }
    },
    [pause, status, volume, switchTo, fail],
  )

  const seek = useCallback((seconds: number) => {
    const el = audio.current
    if (!el || modeRef.current !== 'track') return
    const to = clampSeek(seconds, el.duration)
    el.currentTime = to
    setPosition(to)
  }, [])

  const skip = useCallback(
    (seconds: number) => {
      const el = audio.current
      if (el) seek(el.currentTime + seconds)
    },
    [seek],
  )

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v))
    setVolumeState(clamped)
    if (audio.current) audio.current.volume = clamped
  }, [])

  const close = useCallback(() => {
    const el = audio.current
    if (el) {
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
    switchTo('live', null)
    setPosition(0)
    setDuration(0)
    setStarted(false)
    setStatus('idle')
  }, [switchTo])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const session = navigator.mediaSession
    session.setActionHandler('play', () => {
      const held = trackRef.current
      if (modeRef.current === 'track' && held) toggleTrack(held)
      else play()
    })
    session.setActionHandler('pause', () => pause())
    session.setActionHandler('seekbackward', mode === 'track' ? () => skip(-SKIP_SECONDS) : null)
    session.setActionHandler('seekforward', mode === 'track' ? () => skip(SKIP_SECONDS) : null)
    return () => {
      for (const action of ['play', 'pause', 'seekbackward', 'seekforward'] as const) session.setActionHandler(action, null)
    }
  }, [mode, play, pause, toggleTrack, skip])

  const value = useMemo<Core>(
    () => ({ channels, mode, current, track, status, started, volume, play, pause, toggle, select, toggleTrack, seek, skip, setVolume, close }),
    [channels, mode, current, track, status, started, volume, play, pause, toggle, select, toggleTrack, seek, skip, setVolume, close],
  )
  const progress = useMemo(() => ({ position, duration }), [position, duration])

  return (
    <PlayerContext.Provider value={value}>
      <ProgressContext.Provider value={progress}>
        {children}
        {/* The audio has no caption track of its own: the story's text is on its page, and a live stream is a radio broadcast. The program or story name and the status are shown as text. */}
        <audio
          hidden
          onDurationChange={(e) => {
            const seconds = e.currentTarget.duration
            if (modeRef.current === 'track' && Number.isFinite(seconds) && seconds > 0) setDuration(seconds)
          }}
          onEnded={() => {
            if (modeRef.current === 'track') setStatus('paused')
          }}
          onError={() => setStatus((s) => (s === 'paused' || s === 'idle' ? s : 'error'))}
          onPause={() => setStatus((s) => (s === 'error' || s === 'idle' ? s : 'paused'))}
          onPlaying={() => setStatus('playing')}
          onTimeUpdate={(e) => {
            if (modeRef.current === 'track') setPosition(e.currentTarget.currentTime)
          }}
          onWaiting={() => setStatus('loading')}
          preload="none"
          ref={audio}
        />
      </ProgressContext.Provider>
    </PlayerContext.Provider>
  )
}
