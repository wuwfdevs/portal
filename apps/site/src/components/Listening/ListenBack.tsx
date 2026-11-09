'use client'

import React, { useEffect, useRef, useState } from 'react'

import { formatStopwatch } from '@wuwf/listening-core'

/** "Listen back": plays what was just recorded, from the device. Nothing is uploaded to play it. */
export const ListenBack: React.FC<{ blob: Blob; seconds: number }> = ({ blob, seconds }) => {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)

  // The element is pointed at the recording directly, so no state is set from an effect. The component unmounts when the take
  // is discarded, which is also what resets the position.
  useEffect(() => {
    const next = URL.createObjectURL(blob)
    if (audio.current) audio.current.src = next
    return () => URL.revokeObjectURL(next)
  }, [blob])

  return (
    <div aria-label="Listen back" className="flex min-h-10 items-center gap-3 rounded-full border border-rule-strong bg-surface px-3" role="group">
      <audio
        onEnded={() => {
          setPlaying(false)
          setPosition(0)
        }}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        ref={audio}
      />
      <button
        aria-label={playing ? 'Pause your recording' : 'Play your recording'}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-surface"
        onClick={() => {
          const el = audio.current
          if (!el) return
          if (playing) {
            el.pause()
            setPlaying(false)
          } else {
            void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
          }
        }}
        type="button"
      >
        <svg aria-hidden="true" fill="currentColor" height="12" viewBox="0 0 24 24" width="12">
          {playing ? <path d="M6 4h4v16H6zM14 4h4v16h-4z" /> : <path d="M7 4l14 8-14 8z" />}
        </svg>
      </button>
      <span aria-hidden="true" className="h-1 flex-1 overflow-hidden rounded-sm bg-surface-3">
        <span className="block h-full bg-wuwf-blue-700" style={{ width: `${Math.min(100, (position / Math.max(1, seconds)) * 100)}%` }} />
      </span>
      <span className="font-mono text-xs text-ink-3">
        {formatStopwatch(position)} / {formatStopwatch(seconds)}
      </span>
    </div>
  )
}
