import type { Audio } from '@/payload-types'

/**
 * One piece of on-demand audio, as the site's single player takes it. Plain data, so a server component can build it and hand it to
 * a play button (a client component). The live streams are not tracks: they are `LiveChannel`s (`lib/live/channels.ts`).
 */
export type Track = {
  /** Stable for one audio file, so every button for the same file knows when it is the one playing. */
  id: string
  src: string
  title: string
  /** Who made it ("WUWF News"), shown under the title. */
  credit: string | null
  durationSeconds: number | null
  /** The story or show page this audio belongs to, so the player can link back to it. A site path only. */
  href: string | null
}

/** An address the player may load: a site path, or https. Nothing else (no `javascript:` or `data:` address ever reaches an element). */
export function isPlayableSrc(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.startsWith('/') && !value.startsWith('//')) return true
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

/** A link back to a page of this site: a path that starts with a single slash. Anything else is dropped. */
const sitePath = (value: string | null | undefined): string | null => (value && value.startsWith('/') && !value.startsWith('//') ? value : null)

/**
 * The track for an audio record, or null when there is nothing to play (no file, or one the reader may not fetch: a members-only file
 * reads back without its address). `title` overrides the file's own title (the story's headline is the better label on a card).
 */
export function trackFromAudio(
  audio: Pick<Audio, 'id' | 'url' | 'title' | 'credit' | 'durationSeconds'> | null | undefined,
  options: { title?: string | null; href?: string | null } = {},
): Track | null {
  if (!audio || !isPlayableSrc(audio.url)) return null
  const title = options.title?.trim() || audio.title?.trim()
  if (!title) return null
  const seconds = typeof audio.durationSeconds === 'number' && Number.isFinite(audio.durationSeconds) && audio.durationSeconds > 0 ? audio.durationSeconds : null
  return { id: `audio-${audio.id}`, src: audio.url, title, credit: audio.credit?.trim() || null, durationSeconds: seconds, href: sitePath(options.href) }
}

/** A seek target kept inside the audio: never before the start, never past the end (when the length is known). */
export function clampSeek(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds)) return 0
  const floor = Math.max(0, seconds)
  return Number.isFinite(duration) && duration > 0 ? Math.min(floor, duration) : floor
}

/** "1:23 of 7:37", for a screen reader's reading of the seek slider. */
export function progressWords(position: number, duration: number): string {
  const clock = (s: number) => {
    const total = Math.max(0, Math.floor(Number.isFinite(s) ? s : 0))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const sec = String(total % 60).padStart(2, '0')
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
  }
  return duration > 0 ? `${clock(position)} of ${clock(duration)}` : clock(position)
}
