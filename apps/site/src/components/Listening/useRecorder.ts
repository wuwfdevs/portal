'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { RECORDING_MIME_CANDIDATES, deriveMicrophoneGuidance, readMicrophonePolicy, type MicrophoneGuidance } from '@wuwf/listening-core'

/**
 * The native recorder for the listening screens: `getUserMedia` and `MediaRecorder`, nothing else. The microphone is asked for
 * once, the first time it is needed, and the stream is kept until the component goes away, so a person recording three
 * answers is asked once and not three times. Recording starts on a press and stops on a press (or at the question's limit);
 * nothing records in the background.
 */
export type RecorderPhase = 'idle' | 'recording' | 'recorded'
export type MicState = 'unknown' | 'ready' | 'blocked'

export interface Take {
  blob: Blob
  /** Whole seconds, at least 1, for showing. */
  seconds: number
  /** What the Portal is told, for checking the answer against the question's limit. */
  durationMs: number
}

export interface Recorder {
  phase: RecorderPhase
  /** Seconds elapsed in the current recording. */
  elapsed: number
  take: Take | null
  mic: MicState
  guidance: MicrophoneGuidance | null
  /** Asks for the microphone if it has not been asked for. Resolves true when recording is possible. */
  acquire(): Promise<boolean>
  start(): Promise<void>
  stop(): void
  /** Throws away the current take (a redo, or a saved answer). The microphone stays ready. */
  discard(): void
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined
  return RECORDING_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type))
}

export function useRecorder(maxSeconds: number): Recorder {
  const [phase, setPhase] = useState<RecorderPhase>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [take, setTake] = useState<Take | null>(null)
  const [mic, setMic] = useState<MicState>('unknown')
  const [guidance, setGuidance] = useState<MicrophoneGuidance | null>(null)

  const stream = useRef<MediaStream | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const startedAt = useRef(0)
  const tick = useRef<ReturnType<typeof setInterval> | null>(null)
  const limit = useRef(maxSeconds)
  useEffect(() => {
    limit.current = maxSeconds
  }, [maxSeconds])

  const clearTick = () => {
    if (tick.current) clearInterval(tick.current)
    tick.current = null
  }

  useEffect(
    () => () => {
      clearTick()
      if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
      stream.current?.getTracks().forEach((track) => track.stop())
      stream.current = null
    },
    [],
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

  const stop = useCallback(() => {
    clearTick()
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
  }, [])

  const start = useCallback(async () => {
    if (!(await acquire()) || !stream.current) return
    const mimeType = pickMimeType()
    const next = mimeType ? new MediaRecorder(stream.current, { mimeType }) : new MediaRecorder(stream.current)
    chunks.current = []
    next.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data)
    }
    next.onstop = () => {
      clearTick()
      const durationMs = Math.max(0, Math.round(performance.now() - startedAt.current))
      const blob = new Blob(chunks.current, { type: next.mimeType || mimeType || 'audio/webm' })
      chunks.current = []
      setElapsed(Math.min(limit.current, Math.floor(durationMs / 1000)))
      setTake({ blob, seconds: Math.max(1, Math.round(durationMs / 1000)), durationMs })
      setPhase('recorded')
    }
    recorder.current = next
    setTake(null)
    setElapsed(0)
    startedAt.current = performance.now()
    next.start()
    setPhase('recording')
    tick.current = setInterval(() => {
      const seconds = Math.floor((performance.now() - startedAt.current) / 1000)
      setElapsed(seconds)
      if (seconds >= limit.current) stop()
    }, 250)
  }, [acquire, stop])

  const discard = useCallback(() => {
    setTake(null)
    setElapsed(0)
    setPhase('idle')
  }, [])

  return { phase, elapsed, take, mic, guidance, acquire, start, stop, discard }
}
