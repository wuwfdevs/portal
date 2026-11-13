'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { RECORDING_MIME_CANDIDATES, deriveMicrophoneGuidance, normalizeContentType, readMicrophonePolicy, type MicrophoneGuidance } from '@wuwf/listening-core'

import { canStartAnotherSegment, segmentIsDue, type PendingSegment } from '@/lib/listening/table'

/**
 * The table phone's recorder: one long conversation made of segments of under five minutes, each a complete audio file, so a
 * dropped connection loses at most the segment being sent and the Portal can take them one by one. The microphone is asked for
 * once and the stream is kept until the page goes away. Recording starts on a press and nothing records in the background; a
 * screen wake lock is asked for while recording so the phone does not sleep on the table (it is a request, and may be refused).
 *
 * Between two segments the recorder is stopped and started again on the same stream, which can lose a few milliseconds of
 * sound at the join. That is the cost of every segment being playable on its own.
 */
export type SegmentRecorderMic = 'unknown' | 'ready' | 'blocked'

export interface SegmentRecorder {
  mic: SegmentRecorderMic
  guidance: MicrophoneGuidance | null
  /** Whole seconds of sound recorded, not counting pauses. */
  elapsedSeconds: number
  recording: boolean
  /** The highest segment made so far, or -1. */
  lastSeq: () => number
  acquire(): Promise<boolean>
  /** Starts recording at segment `firstSeq`. */
  begin(firstSeq: number): Promise<boolean>
  /** Ends the current segment and stops. Resolves when the segment has been handed over. */
  pause(): Promise<void>
  resume(): Promise<boolean>
  /** Stops for good and releases the microphone. */
  finish(): Promise<void>
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined
  return RECORDING_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type))
}

/** How often the segment being recorded is handed over as it grows, so a crash loses seconds and not minutes. */
const OPEN_SEGMENT_SLICE_MS = 5000

export function useSegmentRecorder(onSegment: (segment: PendingSegment) => void, onOpenSegment?: (segment: PendingSegment) => void): SegmentRecorder {
  const [mic, setMic] = useState<SegmentRecorderMic>('unknown')
  const [guidance, setGuidance] = useState<MicrophoneGuidance | null>(null)
  const [recording, setRecording] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const stream = useRef<MediaStream | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const segmentStartedAt = useRef(0)
  const priorMs = useRef(0)
  const seq = useRef(-1)
  const keepGoing = useRef(false)
  const tick = useRef<ReturnType<typeof setInterval> | null>(null)
  const wake = useRef<{ release(): Promise<void> } | null>(null)
  const emit = useRef(onSegment)
  const emitOpen = useRef(onOpenSegment)
  useEffect(() => {
    emit.current = onSegment
    emitOpen.current = onOpenSegment
  }, [onSegment, onOpenSegment])

  const releaseWake = useCallback(() => {
    void wake.current?.release().catch(() => undefined)
    wake.current = null
  }, [])

  const requestWake = useCallback(async () => {
    try {
      const api = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock
      if (api && !wake.current) wake.current = await api.request('screen')
    } catch {
      // Refused or unsupported: the page still records; the people at the table may need to keep the screen on.
    }
  }, [])

  const stopTick = () => {
    if (tick.current) clearInterval(tick.current)
    tick.current = null
  }

  const stopStream = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
  }, [])

  useEffect(
    () => () => {
      keepGoing.current = false
      stopTick()
      if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
      stopStream()
      releaseWake()
    },
    [stopStream, releaseWake],
  )

  const acquire = useCallback(async (): Promise<boolean> => {
    if (stream.current) return true
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setGuidance(deriveMicrophoneGuidance({ embedded: false, policyAllowsMicrophone: null, errorName: 'NotSupportedError' }))
      setMic('blocked')
      return false
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      setMic('ready')
      setGuidance(null)
      return true
    } catch (error) {
      setGuidance(
        deriveMicrophoneGuidance({
          embedded: window.self !== window.top,
          policyAllowsMicrophone: readMicrophonePolicy(document),
          errorName: error instanceof DOMException ? error.name : 'NotAllowedError',
        }),
      )
      setMic('blocked')
      return false
    }
  }, [])

  // The segment's own stop handler starts the next one, so it reaches itself through a ref.
  const startSegmentRef = useRef<() => boolean>(() => false)

  const startSegment = useCallback((): boolean => {
    if (!stream.current || !canStartAnotherSegment(seq.current + 1)) return false
    const mimeType = pickMimeType()
    const next = mimeType ? new MediaRecorder(stream.current, { mimeType }) : new MediaRecorder(stream.current)
    chunks.current = []
    seq.current += 1
    const thisSeq = seq.current
    const startedAt = performance.now()
    segmentStartedAt.current = startedAt
    next.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data)
      // The last chunk arrives as the recorder stops, and the finished segment follows at once: only a running recorder is copied.
      if (next.state === 'recording' && chunks.current.length > 0 && emitOpen.current) {
        const type = normalizeContentType(next.mimeType || mimeType || 'audio/webm') || 'audio/webm'
        emitOpen.current({ seq: thisSeq, blob: new Blob(chunks.current, { type }), durationMs: Math.max(0, Math.round(performance.now() - startedAt)), contentType: type })
      }
    }
    next.onstop = () => {
      const durationMs = Math.max(0, Math.round(performance.now() - startedAt))
      const type = normalizeContentType(next.mimeType || mimeType || 'audio/webm') || 'audio/webm'
      const blob = new Blob(chunks.current, { type })
      chunks.current = []
      priorMs.current += durationMs
      if (blob.size > 0) emit.current({ seq: thisSeq, blob, durationMs, contentType: type })
      if (keepGoing.current && recorder.current === next) {
        // Cut at the limit: carry straight on into the next segment.
        if (!startSegmentRef.current()) {
          keepGoing.current = false
          setRecording(false)
        }
      }
    }
    recorder.current = next
    next.start(OPEN_SEGMENT_SLICE_MS)
    return true
  }, [])
  useEffect(() => {
    startSegmentRef.current = startSegment
  }, [startSegment])

  const startTick = useCallback(() => {
    stopTick()
    tick.current = setInterval(() => {
      const current = recorder.current && recorder.current.state === 'recording' ? performance.now() - segmentStartedAt.current : 0
      setElapsedSeconds(Math.floor((priorMs.current + current) / 1000))
      if (current > 0 && segmentIsDue(current) && recorder.current && recorder.current.state === 'recording') recorder.current.stop()
    }, 250)
  }, [])

  const begin = useCallback(
    async (firstSeq: number): Promise<boolean> => {
      if (!(await acquire())) return false
      seq.current = firstSeq - 1
      priorMs.current = 0
      keepGoing.current = true
      if (!startSegment()) return false
      setRecording(true)
      void requestWake()
      startTick()
      return true
    },
    [acquire, requestWake, startSegment, startTick],
  )

  const stopCurrent = useCallback((): Promise<void> => {
    const current = recorder.current
    if (!current || current.state === 'inactive') return Promise.resolve()
    return new Promise((resolve) => {
      const previous = current.onstop
      current.onstop = (event) => {
        previous?.call(current, event)
        resolve()
      }
      current.stop()
    })
  }, [])

  const pause = useCallback(async () => {
    keepGoing.current = false
    await stopCurrent()
    setRecording(false)
    stopTick()
    releaseWake()
  }, [releaseWake, stopCurrent])

  const resume = useCallback(async (): Promise<boolean> => {
    if (!stream.current) return false
    keepGoing.current = true
    if (!startSegment()) return false
    setRecording(true)
    void requestWake()
    startTick()
    return true
  }, [requestWake, startSegment, startTick])

  const finish = useCallback(async () => {
    keepGoing.current = false
    await stopCurrent()
    setRecording(false)
    stopTick()
    stopStream()
    releaseWake()
  }, [releaseWake, stopCurrent, stopStream])

  const lastSeq = useCallback(() => seq.current, [])

  return { mic, guidance, elapsedSeconds, recording, lastSeq, acquire, begin, pause, resume, finish }
}
