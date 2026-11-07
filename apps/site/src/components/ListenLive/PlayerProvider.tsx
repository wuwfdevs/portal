'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import type { LiveChannel } from '@/lib/live/channels'

/**
 * The live player (board 26). One <audio> element for the whole site, in the layout, so it keeps playing as the reader
 * moves between pages. Nothing plays until the reader presses play: no autoplay, and the stream is not even requested
 * before then (preload="none"). Resuming after a pause reconnects, so the listener hears the station now, not a buffer.
 */

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

type PlayerState = {
  channels: LiveChannel[]
  current: LiveChannel
  status: PlayerStatus
  /** True once the reader has pressed play: the bar shows from then on. */
  started: boolean
  volume: number
  play: (key?: string) => void
  pause: () => void
  toggle: (key?: string) => void
  select: (key: string) => void
  setVolume: (v: number) => void
  close: () => void
}

const PlayerContext = createContext<PlayerState | null>(null)

export function useLivePlayer(): PlayerState | null {
  return useContext(PlayerContext)
}

export const PlayerProvider: React.FC<{ channels: LiveChannel[]; children: React.ReactNode }> = ({ channels, children }) => {
  const audio = useRef<HTMLAudioElement>(null)
  const [key, setKey] = useState(channels[0]?.key ?? '')
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [started, setStarted] = useState(false)
  const [volume, setVolumeState] = useState(0.8)
  const current = channels.find((c) => c.key === key) ?? channels[0]

  const play = useCallback(
    (k?: string) => {
      const el = audio.current
      const target = channels.find((c) => c.key === (k ?? key)) ?? channels[0]
      if (!el || !target) return
      setKey(target.key)
      setStarted(true)
      setStatus('loading')
      // Always (re)connect: a live stream resumed from its buffer would be minutes behind the station.
      el.src = target.streamUrl
      el.volume = volume
      el.play().catch((error: DOMException) => {
        if (error?.name !== 'AbortError') setStatus('error')
      })
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: target.name, artist: 'WUWF Public Media', album: 'Live' })
      }
    },
    [channels, key, volume],
  )

  const pause = useCallback(() => {
    const el = audio.current
    if (!el) return
    el.pause()
    // Drop the connection: a paused live stream otherwise keeps downloading.
    el.removeAttribute('src')
    el.load()
    setStatus('paused')
  }, [])

  const toggle = useCallback(
    (k?: string) => {
      const same = !k || k === key
      if (same && (status === 'playing' || status === 'loading')) pause()
      else play(k)
    },
    [key, status, pause, play],
  )

  const select = useCallback(
    (k: string) => {
      if (status === 'playing' || status === 'loading') play(k)
      else setKey(k)
    },
    [status, play],
  )

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v))
    setVolumeState(clamped)
    if (audio.current) audio.current.volume = clamped
  }, [])

  const close = useCallback(() => {
    pause()
    setStarted(false)
    setStatus('idle')
  }, [pause])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.setActionHandler('play', () => play())
    navigator.mediaSession.setActionHandler('pause', () => pause())
    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
    }
  }, [play, pause])

  const value = useMemo<PlayerState | null>(
    () => (current ? { channels, current, status, started, volume, play, pause, toggle, select, setVolume, close } : null),
    [channels, current, status, started, volume, play, pause, toggle, select, setVolume, close],
  )

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/* A live radio stream has no caption track; the program name and status are shown as text. */}
      <audio
        hidden
        onError={() => setStatus((s) => (s === 'paused' || s === 'idle' ? s : 'error'))}
        onPause={() => setStatus((s) => (s === 'error' || s === 'idle' ? s : 'paused'))}
        onPlaying={() => setStatus('playing')}
        onWaiting={() => setStatus('loading')}
        preload="none"
        ref={audio}
      />
    </PlayerContext.Provider>
  )
}
