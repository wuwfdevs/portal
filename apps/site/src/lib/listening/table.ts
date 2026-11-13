import {
  LISTENING_MAX_SEGMENTS,
  LISTENING_SEGMENT_SECONDS,
  type ListeningTable,
  type ListeningTablePrompt,
  type ListeningUpload,
} from '@wuwf/portal-contracts'

import type { ActionResult } from './results'

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
}

export interface SegmentSteps {
  reserve(input: { seq: number; contentType: string }): Promise<ActionResult<{ alreadyUploaded: true } | { upload: ListeningUpload }>>
  put(upload: ListeningUpload, blob: Blob): Promise<boolean>
  complete(input: { seq: number; sizeBytes: number; durationMs: number }): Promise<ActionResult<Record<never, never>>>
}

export type SegmentProgress = { uploaded: number; total: number; failing: boolean }

/**
 * The phone's upload queue. Segments are sent oldest first, one at a time; a failure leaves the segment queued and is tried again,
 * never skipped, so "if the Wi-Fi drops it picks up where it left off" is true while the page stays open. A segment the Portal
 * already holds is dropped from the queue without sending it again. Nothing here says "saved" until the Portal has confirmed the
 * segment (`complete`), the same rule as an answer.
 *
 * What it cannot do: it holds the audio in memory, so closing the page before the queue is empty loses what was not sent.
 */
export class SegmentQueue {
  private queue: PendingSegment[] = []
  private uploadedSeqs = new Set<number>()
  private running: Promise<void> | null = null
  private failing = false
  private lastError: string | null = null

  constructor(
    private readonly steps: SegmentSteps,
    knownUploaded: number[] = [],
  ) {
    for (const seq of knownUploaded) this.uploadedSeqs.add(seq)
  }

  enqueue(segment: PendingSegment): void {
    if (this.uploadedSeqs.has(segment.seq) || this.queue.some((q) => q.seq === segment.seq)) return
    this.queue.push(segment)
    this.queue.sort((a, b) => a.seq - b.seq)
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
    const completed = await this.steps.complete({ seq: segment.seq, sizeBytes: segment.blob.size, durationMs: segment.durationMs })
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
