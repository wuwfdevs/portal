// The rules for the listening events (`events.ts`: `listen_started`, `listen_stopped`, `audio_progressed`), apart from the player that emits
// them (`components/ListenLive/useListenAnalytics.ts`). Pure.
//
// A listen runs from the first sound (the player says "playing") to a pause, a close, an error, a switch to other audio, or leaving the site.
// Buffering in the middle of a listen is part of it. Pausing and pressing play again is a second listen.

import { AUDIO_PERCENTS, MAX_LISTEN_SECONDS, type AudioPercent, type ListenRef } from './events'

/** What the player holds, as a listen reference: the channel for live, the track for on demand. Null when there is nothing to name. */
export function listenRefOf(mode: 'live' | 'track', channelKey: string | null, trackId: string | null): ListenRef | null {
  if (mode === 'live') return channelKey ? { source: 'live', stream_id: channelKey } : null
  return trackId ? { source: 'on_demand', stream_id: trackId } : null
}

export const sameListen = (a: ListenRef | null, b: ListenRef | null): boolean => a?.source === b?.source && a?.stream_id === b?.stream_id

/** Whole seconds from `startedAt` to `now` (milliseconds), never negative and never more than a day. */
export function listenSeconds(startedAt: number, now: number): number {
  const seconds = Math.round((now - startedAt) / 1000)
  return Math.min(MAX_LISTEN_SECONDS, Math.max(0, Number.isFinite(seconds) ? seconds : 0))
}

/** How close to the end counts as the end, in seconds: a file's last timeupdate often falls just short of its length. */
const END_SLACK = 0.5

/**
 * The quarter marks this position has reached that are not in `done`, in order. 100 is the end (within `END_SLACK`). Nothing for a length
 * that is not known.
 */
export function marksReached(position: number, duration: number, done: ReadonlySet<AudioPercent>): AudioPercent[] {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position) || position <= 0) return []
  return AUDIO_PERCENTS.filter((p) => !done.has(p) && (p === 100 ? position >= duration - END_SLACK : position >= (duration * p) / 100))
}
