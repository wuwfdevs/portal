import {
  LISTENING_MAX_SEGMENTS,
  LISTENING_SEGMENT_SECONDS,
  type ListeningTable,
  type ListeningTablePrompt,
  type ListeningUpload,
} from '@wuwf/portal-contracts'

import { looksLikeEmail, type Checked } from './inbox'
import type { ActionResult } from './results'
import type { SegmentStore } from './segment-store'

/**
 * The rules of a table's phone (boards 5d and 5f), kept apart from React and from the network so they are tested on their own.
 * The Portal decides what is allowed (the agreement before the first segment, the segment limits, a link used once); these
 * decide what the phone shows and in what order it sends.
 */

export type TableScreen = 'before' | 'recording' | 'paused' | 'finishing' | 'done'

/** What a table's phone shows for the state the Portal reports. */
export function tableScreen(table: Pick<ListeningTable, 'state'>): TableScreen {
  switch (table.state) {
    case 'waiting':
    case 'agreed':
      return 'before'
    case 'recording':
      return 'recording'
    case 'paused':
      return 'paused'
    case 'ended':
      return 'finishing'
    case 'sent':
      return 'done'
  }
}

/** `1:05:09` or `5:09`: whole seconds, never negative. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const rest = `${m}:${String(r).padStart(2, '0')}`
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : rest
}

/** "2 minutes", "10 minutes", or null when the prompt names no time. */
export function suggestedTimeLabel(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}

/** The prompt label the board shows: "First, go around the table", "The question", "Prompt 2 of 4". */
export function promptLabel(prompts: ListeningTablePrompt[], prompt: ListeningTablePrompt): string {
  if (prompt.kind === 'intro') return 'First, go around the table'
  if (prompt.kind === 'question') return 'The question'
  const prompted = prompts.filter((p) => p.kind === 'prompt')
  const index = prompted.findIndex((p) => p.position === prompt.position)
  return index === -1 ? 'Prompt' : `Prompt ${index + 1} of ${prompted.length}`
}

/** The prompt at a position, or the nearest one that exists. Null only when there are no prompts. */
export function promptAt(prompts: ListeningTablePrompt[], position: number): ListeningTablePrompt | null {
  if (prompts.length === 0) return null
  const ordered = [...prompts].sort((a, b) => a.position - b.position)
  return ordered.find((p) => p.position === position) ?? ordered.filter((p) => p.position < position).at(-1) ?? ordered[0] ?? null
}

/** The prompt before or after `position`, or null at either end. */
export function neighbourPosition(prompts: ListeningTablePrompt[], position: number, direction: -1 | 1): number | null {
  const ordered = [...prompts].sort((a, b) => a.position - b.position)
  const index = ordered.findIndex((p) => p.position === position)
  if (index === -1) return null
  return ordered[index + direction]?.position ?? null
}

/**
 * Whether "Help is coming" may be said. A request is always flagged; the Portal says whether anyone is watching for it. When no
 * console has checked in, the page says so and, if it is urgent, to ask at the front, so it never promises help nobody can see.
 */
export function helpSentence(table: Pick<ListeningTable, 'helpRequested' | 'helpAvailable'>): { button: string; note: string | null } {
  if (!table.helpRequested) return { button: 'Need a hand', note: null }
  return table.helpAvailable
    ? { button: 'Help is coming', note: null }
    : { button: 'Asked for help', note: 'Your request is flagged for WUWF. If it is urgent, ask someone at the front.' }
}

/** Whether to show the organizer's "last five minutes" note. */
export function lastCallShown(table: Pick<ListeningTable, 'lastCallAt'>): boolean {
  return table.lastCallAt !== null
}

/** True when the table is on a different prompt from the room. The room's is a suggestion; a table moves on its own. */
export function tableIsAheadOrBehind(table: Pick<ListeningTable, 'promptPosition' | 'eventPromptPosition'>): boolean {
  return table.promptPosition !== table.eventPromptPosition
}

// ---------------------------------------------------------------------------------------------------------------
// Segments

/** A segment is cut a little before the Portal's limit so a slow timer can never push one over it. */
export const SEGMENT_CUT_SECONDS = LISTENING_SEGMENT_SECONDS - 10

/** Whether the segment being recorded has reached the point where the phone starts the next one. */
export function segmentIsDue(segmentElapsedMs: number): boolean {
  return segmentElapsedMs >= SEGMENT_CUT_SECONDS * 1000
}

/** Whether another segment may be started. The Portal takes at most 100 (about eight hours). */
export function canStartAnotherSegment(nextSeq: number): boolean {
  return nextSeq < LISTENING_MAX_SEGMENTS
}

export interface PendingSegment {
  seq: number
  blob: Blob
  durationMs: number
  contentType: string
  /** When the phone started recording this segment (ISO). Lets the Portal show where a phone slept or a microphone dropped. */
  startedAt?: string
}

export interface SegmentSteps {
  reserve(input: { seq: number; contentType: string }): Promise<ActionResult<{ alreadyUploaded: true } | { upload: ListeningUpload }>>
  put(upload: ListeningUpload, blob: Blob): Promise<boolean>
  complete(input: { seq: number; sizeBytes: number; durationMs: number; startedAt?: string }): Promise<ActionResult<Record<never, never>>>
}

export type SegmentProgress = { uploaded: number; total: number; failing: boolean }

/**
 * The phone's upload queue. Segments are sent oldest first, one at a time; a failure leaves the segment queued and is tried again,
 * never skipped, so "if the Wi-Fi drops it picks up where it left off" is true while the page stays open. A segment the Portal
 * already holds is dropped from the queue without sending it again. Nothing here says "saved" until the Portal has confirmed the
 * segment (`complete`), the same rule as an answer.
 *
 * With a store, every segment is also kept in the browser's own storage until the Portal confirms it, and `restore()` brings back
 * what a reload or a crash left behind. Without one (a browser that will not give storage) the audio is held in memory only, and
 * closing the page before the queue is empty loses what was not sent; the page says so.
 */
export class SegmentQueue {
  private queue: PendingSegment[] = []
  private uploadedSeqs = new Set<number>()
  private running: Promise<void> | null = null
  private failing = false
  private lastError: string | null = null
  private storeFailed = false

  constructor(
    private readonly steps: SegmentSteps,
    knownUploaded: number[] = [],
    private readonly store: SegmentStore | null = null,
  ) {
    for (const seq of knownUploaded) this.uploadedSeqs.add(seq)
  }

  /**
   * Adds a finished segment. It is in the queue at once; the returned promise settles when the copy on the phone is written, so a
   * caller that awaits it knows the segment survives a reload. A failure to write is not a failure to send.
   */
  async enqueue(segment: PendingSegment): Promise<void> {
    if (this.uploadedSeqs.has(segment.seq) || this.queue.some((q) => q.seq === segment.seq)) return
    this.queue.push(segment)
    this.queue.sort((a, b) => a.seq - b.seq)
    if (!this.store) return
    try {
      await this.store.put(segment)
      await this.store.clearOpen(segment.seq)
    } catch {
      this.storeFailed = true
    }
  }

  /** The segment being recorded, copied as it grows. Best effort: a failure here never stops the recording. */
  async keepOpen(segment: PendingSegment): Promise<void> {
    if (!this.store) return
    try {
      await this.store.putOpen(segment)
    } catch {
      this.storeFailed = true
    }
  }

  /**
   * Brings back what an earlier page left on the phone: segments the Portal has not confirmed, and the segment that was being
   * recorded when the page went away. Returns how many are waiting now. A stored segment the Portal already holds is deleted.
   */
  async restore(): Promise<number> {
    if (!this.store) return this.queue.length
    let saved: PendingSegment[] = []
    try {
      saved = await this.store.all()
    } catch {
      this.storeFailed = true
      return this.queue.length
    }
    for (const segment of saved) {
      if (this.uploadedSeqs.has(segment.seq)) {
        await this.store.remove(segment.seq).catch(() => undefined)
        await this.store.clearOpen(segment.seq).catch(() => undefined)
      } else if (!this.queue.some((q) => q.seq === segment.seq) && segment.blob.size > 0) {
        this.queue.push(segment)
      }
    }
    this.queue.sort((a, b) => a.seq - b.seq)
    return this.queue.length
  }

  /** Every segment this table is known to have made: confirmed, or waiting here. The next one starts after the highest. */
  highestSeq(): number {
    return Math.max(-1, ...this.uploadedSeqs, ...this.queue.map((q) => q.seq))
  }

  /** Whether the copy on the phone could not be written at some point, so the page must not promise the recording survives a reload. */
  backupFailed(): boolean {
    return this.storeFailed || this.store === null
  }

  /** The conversation is over and the Portal has all of it: the copies on the phone go. */
  async clearBackup(): Promise<void> {
    await this.store?.clear().catch(() => undefined)
  }

  progress(): SegmentProgress {
    return { uploaded: this.uploadedSeqs.size, total: this.uploadedSeqs.size + this.queue.length, failing: this.failing }
  }

  /** The sentence for the last failure, or null. */
  error(): string | null {
    return this.lastError
  }

  /** Sequence numbers still waiting to be sent. */
  waiting(): number[] {
    return this.queue.map((q) => q.seq)
  }

  /** Sends what is queued, oldest first. Resolves when the queue is empty or the next segment fails; call again to retry. */
  drain(): Promise<void> {
    this.running ??= this.run().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async run(): Promise<void> {
    this.failing = false
    while (this.queue.length > 0) {
      const next = this.queue[0]!
      const sent = await this.sendOne(next)
      if (!sent) {
        this.failing = true
        return
      }
      this.queue.shift()
      this.uploadedSeqs.add(next.seq)
      this.lastError = null
      // Only now, with the Portal's confirmation, does the copy on the phone go.
      await this.store?.remove(next.seq).catch(() => undefined)
    }
  }

  private async sendOne(segment: PendingSegment): Promise<boolean> {
    const reserved = await this.steps.reserve({ seq: segment.seq, contentType: segment.contentType })
    if (!reserved.ok) {
      this.lastError = reserved.message
      return false
    }
    if ('alreadyUploaded' in reserved) return true
    const put = await this.steps.put(reserved.upload, segment.blob)
    if (!put) {
      this.lastError = 'The connection dropped. The recording is safe on this phone and will send when it is back.'
      return false
    }
    const completed = await this.steps.complete({
      seq: segment.seq,
      sizeBytes: segment.blob.size,
      durationMs: segment.durationMs,
      ...(segment.startedAt ? { startedAt: segment.startedAt } : {}),
    })
    if (!completed.ok) {
      this.lastError = completed.message
      return false
    }
    return true
  }
}

/** Percent sent, never 100 until nothing is waiting. */
export function sendPercent(progress: SegmentProgress): number {
  if (progress.total === 0) return 0
  const pct = Math.floor((progress.uploaded / progress.total) * 100)
  return progress.uploaded < progress.total ? Math.min(99, pct) : 100
}

/**
 * What a table page that reloads after the table has ended may tell the facilitator. The Portal's conversation status is the only
 * honest source: "complete" or later means it holds every segment up to the last one, "uploading" means it does not, and anything
 * else is not known, so the page must not say the whole recording is in.
 */
export type EndedView = 'in' | 'missing' | 'unknown'

export function endedView(status: string | null): EndedView {
  switch (status) {
    case 'complete':
    case 'transcribing':
    case 'ready':
    case 'named':
    case 'sent':
      return 'in'
    case 'uploading':
    case 'recording':
      return 'missing'
    default:
      return 'unknown'
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The facilitator

export interface FacilitatorInput {
  firstName: string
  email: string
  /** How many are at the table, counting the facilitator, as typed. Optional. */
  people?: string
}

/** The most people a table's size can say; the transcription is told a range around it, so it only narrows the guess. */
export const MAX_TABLE_PEOPLE = 20

/**
 * What the facilitator gives when the table agrees: an optional first name and a required email. The email is how WUWF sends them
 * the one link to name the voices and mark what mattered; the Portal checks it again and never sends it back to this site.
 */
export function checkFacilitator(input: FacilitatorInput): Checked<{ firstName: string | null; email: string; people: number | null }> {
  const firstName = input.firstName.trim()
  const email = input.email.trim()
  const peopleText = (input.people ?? '').trim()
  let people: number | null = null
  if (peopleText !== '') {
    const n = Number(peopleText)
    if (!Number.isInteger(n) || n < 1 || n > MAX_TABLE_PEOPLE) return { ok: false, message: `How many are at the table? Enter a number from 1 to ${MAX_TABLE_PEOPLE}, or leave it blank.` }
    people = n
  }
  if (firstName.length > 60) return { ok: false, message: 'A first name can be at most 60 characters.' }
  if (email.length === 0) return { ok: false, message: 'Add your email. It is where WUWF sends the link to name your table’s voices.' }
  if (email.length > 320 || !looksLikeEmail(email)) return { ok: false, message: 'That email address does not look right.' }
  return { ok: true, value: { firstName: firstName || null, email, people } }
}

// ---------------------------------------------------------------------------------------------------------------
// When the microphone stops hearing

/** What the recorder knows about the microphone while a table is recording. */
export interface MicHealth {
  /** The track ended (unplugged, taken by a call, revoked): nothing more will be heard until it is asked for again. */
  ended: boolean
  /** The system muted the track (a phone call, or a phone that locked and slept): the recorder keeps running but hears nothing. */
  muted: boolean
  /** The page was hidden while recording, so the phone may have slept. */
  wentAway: boolean
  /** The screen wake lock is not held although the table is recording. */
  wakeLost: boolean
}

export interface RecordingNotice {
  tone: 'alert' | 'note'
  title: string
  body: string
  /** The button offered, if one fixes it. */
  action: 'reconnect' | 'dismiss' | null
}

/**
 * The one sentence a recording table's phone shows when something is wrong with what it can hear, most serious first. Null when all is
 * well. The words say what happened and what to do, and never imply the recording is fine when it is not.
 */
export function recordingNotice(health: MicHealth): RecordingNotice | null {
  if (health.ended) {
    return {
      tone: 'alert',
      title: 'The microphone stopped',
      body: 'Something took the microphone, like a call or an unplugged headset. Nothing is being recorded. Reconnect it to carry on; what was recorded before is safe.',
      action: 'reconnect',
    }
  }
  if (health.muted) {
    return {
      tone: 'alert',
      title: 'The phone is not hearing you',
      body: 'The phone has muted its microphone, usually because of a call or because the screen was locked. Nothing is being recorded until it is back. Keep this page open and the screen on.',
      action: null,
    }
  }
  if (health.wentAway) {
    return {
      tone: 'note',
      title: 'This page was in the background',
      body: 'Some phones stop recording when the screen locks or another app is open, so a stretch may be missing. It carries on now. Keep this page open and the screen on.',
      action: 'dismiss',
    }
  }
  if (health.wakeLost) {
    return {
      tone: 'note',
      title: 'The screen may turn off',
      body: 'This phone would not keep its screen awake. Leave it plugged in and touch the screen now and then, or turn off auto-lock.',
      action: 'dismiss',
    }
  }
  return null
}

/** The instruction shown before recording starts: the things that keep a long recording whole. */
export const BEFORE_RECORDING_STEPS = [
  'Plug the phone in, or check it has enough charge for the whole conversation.',
  'Set it face up on the table, near the middle, with the screen on.',
  'Keep this page open. Locking the screen or opening another app can stop the recording on some phones.',
] as const
