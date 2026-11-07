import React from 'react'

import type { PlayerStatus } from './PlayerProvider'

export const PlayIcon: React.FC<{ playing: boolean; size: number }> = ({ playing, size }) => (
  <svg aria-hidden="true" fill="currentColor" height={size} viewBox="0 0 24 24" width={size}>
    <path d={playing ? 'M6 4h4v16H6zM14 4h4v16h-4z' : 'M7 4l14 8-14 8z'} />
  </svg>
)

const WORDS: Record<PlayerStatus, string> = {
  idle: 'Press play to listen',
  loading: 'Connecting…',
  playing: 'Playing',
  paused: 'Paused',
  error: 'The stream stopped. Press play to try again.',
}

/** The player's state in words, announced politely to screen readers; never colour alone. */
export const StatusLine: React.FC<{ status: PlayerStatus }> = ({ status }) => (
  <span aria-live="polite" role="status">
    {WORDS[status]}
  </span>
)
