'use client'

import Link from 'next/link'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ListeningTable } from '@wuwf/portal-contracts'

import { agreeTable, completeSegment, endTable, leaveTable, readTable, reserveSegment, updateTable } from '@/app/(frontend)/listens/table-actions'
import { openSegmentStore, type SegmentStore } from '@/lib/listening/segment-store'
import { putToSignedUrl } from '@/lib/listening/send-answer'
import {
  SegmentQueue,
  BEFORE_RECORDING_STEPS,
  MAX_TABLE_PEOPLE,
  checkFacilitator,
  endedView,
  formatClock,
  helpSentence,
  microphoneAdvice,
  tableWords,
  lastCallShown,
  neighbourPosition,
  promptAt,
  promptLabel,
  recordingNotice,
  sendPercent,
  suggestedTimeLabel,
  tableScreen,
  tableIsAheadOrBehind,
  type PendingSegment,
} from '@/lib/listening/table'
import { cn } from '@/utilities/ui'

import { buttonDark, buttonPrimary, buttonSecondary, eyebrow, field, label, noticeInfo, noticeOk, noticeWarn } from './styles'
import { useSegmentRecorder } from './useSegmentRecorder'

/** How often the phone asks the Portal where the room is (the last-five-minutes call, the room's prompt, whether help is watched). */
const POLL_MS = 6000
/** How many times the end of the conversation retries a segment that will not send before it says so. */
const END_ATTEMPTS = 6

/**
 * A table's phone (boards 5d and 5f). It follows the Portal's state for the table and holds the audio in memory until the Portal
 * confirms each segment. Nothing records until the facilitator has agreed for the table (the Portal refuses a segment before
 * that); the consent wording shown is the version the Portal named, and that version is sent back with the tap.
 */
export const TableSession: React.FC<{ initial: ListeningTable; conversationStatus: string | null }> = ({ initial, conversationStatus }) => {
  // The copy of the recording kept on the phone is opened first: nothing records until it is known whether there is one.
  const [store, setStore] = useState<SegmentStore | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    void openSegmentStore(`${initial.eventTitle}|${initial.number}`).then((opened) => {
      if (alive) setStore(opened)
    })
    return () => {
      alive = false
    }
  }, [initial.eventTitle, initial.number])

  if (store === undefined) {
    return (
      <main className="mx-auto flex min-h-[60vh] w-full max-w-md items-center justify-center px-5 py-8" aria-busy="true">
        <p className="text-base text-ink-2">Opening your table…</p>
      </main>
    )
  }
  return <TableSessionOpen conversationStatus={conversationStatus} initial={initial} store={store} />
}

type Ending = null | 'sending' | 'sent' | 'partial' | 'unknown'

const TableSessionOpen: React.FC<{ initial: ListeningTable; conversationStatus: string | null; store: SegmentStore | null }> = ({ initial, conversationStatus, store }) => {
  const [table, setTable] = useState<ListeningTable>(initial)
  const [name, setName] = useState(initial.facilitatorFirstName ?? '')
  const [email, setEmail] = useState('')
  const [people, setPeople] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [ready, setReady] = useState(false)
  const [recovered, setRecovered] = useState(0)
  const [ending, setEnding] = useState<Ending>(() => {
    if (initial.state !== 'ended' && initial.state !== 'sent') return null
    const view = endedView(conversationStatus)
    return view === 'in' ? 'sent' : view === 'missing' ? 'partial' : 'unknown'
  })
  const [, bump] = useState(0)

  const queue = useMemo(
    () =>
      new SegmentQueue(
        {
          reserve: reserveSegment,
          put: (upload, blob) => putToSignedUrl(upload, blob),
          complete: completeSegment,
        },
        initial.uploadedSeqs,
        store,
      ),
    [initial.uploadedSeqs, store],
  )

  const onSegment = useCallback(
    (segment: PendingSegment) => {
      void queue
        .enqueue(segment)
        .then(() => queue.drain())
        .then(() => bump((n) => n + 1))
    },
    [queue],
  )
  const onOpenSegment = useCallback((segment: PendingSegment) => void queue.keepOpen(segment), [queue])
  const recorder = useSegmentRecorder(onSegment, onOpenSegment)

  const screen = tableScreen(table)
  const prompt = promptAt(table.prompts, table.promptPosition)
  const roomPrompt = promptAt(table.prompts, table.eventPromptPosition)

  // What an earlier page left on the phone comes back now, before anything can record. A table that has not started has recorded
  // nothing, so a copy found for it belongs to some other session and is thrown away.
  const restored = useRef(false)
  const finishUpRef = useRef<(lastSeq: number) => Promise<void>>(async () => undefined)
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    void (async () => {
      if (initial.state === 'waiting' || initial.state === 'agreed') await queue.clearBackup()
      const waiting = await queue.restore()
      setRecovered(waiting)
      setReady(true)
      if (waiting > 0 && (initial.state === 'ended' || initial.state === 'sent')) {
        // The page was reloaded after the table ended with parts still on the phone: send them and tell the Portal again.
        await finishUpRef.current(queue.highestSeq())
      } else if (waiting > 0) {
        await queue.drain()
        bump((n) => n + 1)
      }
    })()
  }, [initial.state, queue])

  // Follow the room while the table is open. A failed poll is quiet: the recording does not depend on it.
  useEffect(() => {
    if (screen === 'finishing' || screen === 'done') return
    const id = setInterval(async () => {
      const result = await readTable()
      if (result.ok) setTable(result.table)
    }, POLL_MS)
    return () => clearInterval(id)
  }, [screen])

  // A recording that is not on the Portal yet is lost if the page closes without a copy on the phone: ask before it does.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (recorder.recording || queue.waiting().length > 0) event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [recorder.recording, queue])

  const apply = (result: Awaited<ReturnType<typeof updateTable>>): boolean => {
    if (!result.ok) {
      setError(result.message)
      return false
    }
    setTable(result.table)
    return true
  }

  /** Starts a recorder on this page after the last segment anyone made, whether this page made it or an earlier one did. */
  const beginHere = async (): Promise<boolean> => {
    if (recorder.lastSeq() >= 0) return recorder.resume()
    return recorder.begin(queue.highestSeq() + 1)
  }

  const agree = async () => {
    if (busy || !ready || !table.consent) return
    setBusy(true)
    setError(null)
    try {
      // The microphone first: a refusal is found out before anyone has been told they are being recorded.
      if (!(await recorder.acquire())) return
      if (table.state === 'waiting') {
        const facilitator = checkFacilitator({ firstName: name, email, people })
        if (!facilitator.ok) {
          setError(facilitator.message)
          return
        }
        const agreed = await agreeTable({
          consentVersion: table.consent.version,
          firstName: facilitator.value.firstName,
          email: facilitator.value.email,
          people: facilitator.value.people,
        })
        if (!apply(agreed)) return
      }
      const started = await updateTable({ event: 'start' })
      if (!apply(started)) return
      if (!(await beginHere())) setError('This phone could not start recording. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const togglePause = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (screen === 'recording') {
        await recorder.pause()
        apply(await updateTable({ event: 'pause' }))
      } else if (apply(await updateTable({ event: 'resume' }))) {
        if (!(await recorder.acquire()) || !(await beginHere())) setError('This phone could not start recording again. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  /** The page was reloaded while the table was recording: the Portal still says recording, this page is not. */
  const recordAgain = async () => {
    if (busy || !ready) return
    setBusy(true)
    setError(null)
    try {
      if (!(await recorder.acquire())) return
      if (!(await beginHere())) setError('This phone could not start recording again. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const movePrompt = async (direction: -1 | 1) => {
    const next = neighbourPosition(table.prompts, table.promptPosition, direction)
    if (next === null || busy) return
    setBusy(true)
    setError(null)
    apply(await updateTable({ event: 'prompt', promptPosition: next }))
    setBusy(false)
  }

  const toggleHelp = async () => {
    if (busy) return
    setBusy(true)
    apply(await updateTable({ event: table.helpRequested ? 'help-clear' : 'help' }))
    setBusy(false)
  }

  /** Sends what is left and tells the Portal the table is over, until the Portal says it holds every segment. */
  const finishUp = async (lastSeq: number) => {
    setBusy(true)
    setConfirmEnd(false)
    setError(null)
    setEnding('sending')
    let missing: number[] = []
    for (let attempt = 0; attempt < END_ATTEMPTS; attempt += 1) {
      await queue.drain()
      bump((n) => n + 1)
      const result = await endTable(lastSeq)
      if (!result.ok) {
        setError(result.message)
        await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)))
        continue
      }
      missing = result.missing
      if (result.complete && queue.waiting().length === 0) {
        await queue.clearBackup()
        setEnding('sent')
        const fresh = await readTable()
        if (fresh.ok) setTable(fresh.table)
        setBusy(false)
        return
      }
      // The Portal still lacks some: whatever this page still holds is sent again, then it tries once more.
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    setEnding(queue.waiting().length > 0 || missing.length > 0 ? 'partial' : 'sent')
    setBusy(false)
  }

  useEffect(() => {
    finishUpRef.current = finishUp
  })

  const end = async () => {
    if (busy) return
    await recorder.finish()
    await finishUp(Math.max(recorder.lastSeq(), queue.highestSeq()))
  }

  const retryEnd = () => {
    void finishUp(queue.highestSeq())
  }

  const progress = queue.progress()
  const clock = formatClock(recorder.elapsedSeconds)
  const help = helpSentence(table)
  const words = tableWords(table)

  const header = (
    <div className="flex items-center justify-between border-b border-rule px-5 py-3.5">
      <span className="text-[0.8125rem] font-bold">
        {words.header}
        {!words.own && <span className="font-normal text-ink-3"> · {table.eventTitle}</span>}
      </span>
      <span className="text-[0.8125rem] text-ink-3">{table.placeName}</span>
    </div>
  )

  // ---- Finishing: the last segments are sent, then the table is in.
  if (ending) {
    return (
      <div className="flex min-h-[80vh] flex-col">
        {header}
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-8 text-center" aria-live="polite">
          {ending === 'sending' && (
            <>
              <h1 className="font-serif text-2xl font-bold leading-tight">{words.sending}</h1>
              <p className="max-w-sm text-[0.9375rem] text-ink-2">Keep this screen open until it finishes. If the Wi-Fi drops, it picks up where it left off.</p>
              <div aria-hidden className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-wuwf-blue-700 transition-[width]" style={{ width: `${sendPercent(progress)}%` }} />
              </div>
              <span className="font-mono text-[0.8125rem] text-ink-3">
                {sendPercent(progress)}% · {clock}
              </span>
              {error && <p className={noticeWarn}>{error}</p>}
            </>
          )}
          {ending === 'sent' && (
            <>
              <div aria-hidden className="flex size-14 items-center justify-center rounded-full border border-wuwf-lime bg-wuwf-lime-100">
                <svg fill="none" height="24" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="24" className="text-lime-text">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h1 className="font-serif text-2xl font-bold leading-tight">{words.done}</h1>
              <p className="max-w-sm text-[0.9375rem] text-ink-2">
                WUWF has the whole recording. When the transcript is ready you can put names to your table&rsquo;s voices and mark what mattered; it takes about ten minutes.
              </p>
              <Link className={cn(buttonDark, 'min-h-12 w-full max-w-sm text-base')} href="/listens/session/after">
                Name the voices and mark what mattered
              </Link>
              <p className="max-w-sm text-sm text-ink-3">WUWF will email you a link when the transcript is ready, so you can do this on any phone or computer within two weeks. You can also do it now on this phone.</p>
            </>
          )}
          {ending === 'unknown' && (
            <>
              <h1 className="font-serif text-2xl font-bold leading-tight">{words.ended}</h1>
              <p className="max-w-sm text-[0.9375rem] text-ink-2">
                This page could not check whether all of the recording reached WUWF, so it will not say that it did. Reload in a moment; if this stays, {words.askForHelp}
              </p>
              <Link className={cn(buttonSecondary, 'min-h-12 w-full max-w-sm text-base')} href="/listens/session/after">
                Open the after-page
              </Link>
            </>
          )}
          {ending === 'partial' && (
            <>
              <h1 className="font-serif text-2xl font-bold leading-tight">{words.partial}</h1>
              <p className="max-w-sm text-[0.9375rem] text-ink-2">
                {progress.total - progress.uploaded > 0
                  ? `${progress.total - progress.uploaded} part${progress.total - progress.uploaded === 1 ? '' : 's'} of the recording ${progress.total - progress.uploaded === 1 ? 'is' : 'are'} still on this phone. Keep this page open, get back on Wi-Fi and send again.`
                  : 'Part of the recording is not at WUWF and is no longer on this phone. ' + words.askForHelpPartial}
              </p>
              {error && <p className={noticeWarn}>{error}</p>}
              {progress.total - progress.uploaded > 0 && (
                <button className={cn(buttonDark, 'min-h-12 w-full max-w-sm text-base')} disabled={busy} onClick={retryEnd} type="button">
                  {busy ? 'Sending…' : 'Send again'}
                </button>
              )}
            </>
          )}
        </main>
      </div>
    )
  }

  // ---- Before: the agreement.
  if (screen === 'before') {
    return (
      <div className="flex min-h-[80vh] flex-col">
        {header}
        <main className="flex flex-1 flex-col gap-4 px-5 py-5">
          <span className={eyebrow}>{words.eyebrow ?? table.eventTitle}</span>
          <h1 className="font-serif text-[1.75rem] font-bold leading-tight">{words.ready}</h1>
          <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
            <Step n={1}>
              <strong>Put the phone in the middle of the table.</strong> Keep the screen on and this page open. Recording continues if the screen locks, but it stops if the page closes.
            </Step>
            <Step n={2}>
              <strong>Hear the agreement read aloud.</strong> {words.consentStep}
            </Step>
            <Step n={3}>
              <strong>The prompts are yours to move.</strong> {words.promptsStep}
            </Step>
          </ol>

          {table.consent ? (
            <blockquote className="m-0 border-l-[3px] border-wuwf-blue bg-wuwf-blue-50 p-4 font-serif text-[1.0625rem] leading-relaxed">&ldquo;{table.consent.text}&rdquo;</blockquote>
          ) : (
            <p className={noticeWarn} role="alert">
              WUWF has not set the wording for this session yet, so it cannot record. Ask someone at WUWF.
            </p>
          )}

          {table.state === 'waiting' && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className={label} htmlFor="facilitator-name">
                  Your first name (optional)
                </label>
                <input
                  autoComplete="given-name"
                  className={field}
                  id="facilitator-name"
                  maxLength={60}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="So WUWF knows who to thank"
                  type="text"
                  value={name}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={label} htmlFor="facilitator-email">
                  Your email
                </label>
                <input
                  autoComplete="email"
                  className={field}
                  id="facilitator-email"
                  inputMode="email"
                  maxLength={320}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
                <span className="text-xs text-ink-3">
                  WUWF emails you one link, once the transcript is ready, to name the voices at your table and mark what mattered. It is not shared or used for anything else, and WUWF removes it {words.retention}.
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={label} htmlFor="table-people">
                  How many are at your table, counting you? (optional)
                </label>
                <input
                  className={field}
                  id="table-people"
                  inputMode="numeric"
                  max={MAX_TABLE_PEOPLE}
                  min={1}
                  onChange={(event) => setPeople(event.target.value)}
                  type="number"
                  value={people}
                />
                <span className="text-xs text-ink-3">It helps the transcript tell the voices apart. A rough number is fine.</span>
              </div>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm text-ink-2">
                {BEFORE_RECORDING_STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </>
          )}

          {recorder.guidance && (
            <p className={noticeWarn} role="alert">
              {microphoneAdvice(recorder.guidance, isIos())}
            </p>
          )}
          {error && (
            <p className={noticeWarn} role="alert">
              {error}
            </p>
          )}
          <button className={cn(buttonDark, 'mt-auto min-h-12 w-full text-base')} disabled={busy || !ready || !table.consent} onClick={agree} type="button">
            {busy ? 'Starting…' : ready ? 'Everyone at our table agreed. Start recording' : 'Getting ready…'}
          </button>
          <Leave words={words} />
        </main>
      </div>
    )
  }

  // ---- Recording or paused.
  const paused = screen === 'paused'
  const canBack = neighbourPosition(table.prompts, table.promptPosition, -1) !== null
  const canNext = neighbourPosition(table.prompts, table.promptPosition, 1) !== null
  const time = suggestedTimeLabel(prompt?.suggestedSeconds ?? null)
  return (
    <div className="flex min-h-[80vh] flex-col">
      {header}
      <main className="flex flex-1 flex-col gap-4 px-5 py-5">
        <div className="flex items-center justify-between">
          <span className={cn('flex items-center gap-2 text-sm font-bold', paused ? 'text-warning-fg' : 'text-on-air-red')}>
            <span aria-hidden className={cn('size-2.5 rounded-full', paused ? 'bg-warning-fg' : 'animate-pulse bg-on-air-red')} />
            {paused ? 'Paused' : recorder.recording ? 'Recording' : 'Waiting to record'}
          </span>
          <span className="font-mono text-[1.375rem] font-medium" role="timer">
            {clock}
          </span>
        </div>

        {(() => {
          const notice = paused ? null : recordingNotice(recorder.health)
          if (!notice) return null
          return (
            <div className={cn(notice.tone === 'alert' ? noticeWarn : noticeInfo, 'flex flex-col gap-2.5')} role={notice.tone === 'alert' ? 'alert' : 'status'}>
              <span>
                <strong>{notice.title}.</strong> {notice.body}
              </span>
              {notice.action === 'reconnect' && (
                <button
                  className={cn(buttonDark, 'self-start')}
                  disabled={busy}
                  onClick={() => {
                    setBusy(true)
                    void recorder.reconnect().then((ok) => {
                      if (!ok) setError('This phone could not get the microphone back. Check that no call or other app is using it, then try again.')
                      setBusy(false)
                    })
                  }}
                  type="button"
                >
                  Reconnect the microphone
                </button>
              )}
              {notice.action === 'dismiss' && (
                <button className={cn(buttonSecondary, 'self-start')} onClick={recorder.dismissNotice} type="button">
                  Got it
                </button>
              )}
            </div>
          )
        })()}
        {!recorder.recording && !paused && !recorder.health.ended && (
          <div className={cn(noticeWarn, 'flex flex-col gap-2.5')} role="alert">
            <span>
              <strong>This page is not recording.</strong> It was reloaded or lost the microphone.
              {recovered > 0 ? ` ${recovered} saved ${recovered === 1 ? 'part was' : 'parts were'} found on this phone and ${recovered === 1 ? 'is' : 'are'} sending.` : ''}
            </span>
            <button className={cn(buttonDark, 'self-start')} disabled={busy || !ready} onClick={recordAgain} type="button">
              Start recording again
            </button>
          </div>
        )}
        {queue.backupFailed() && (
          <p className={noticeInfo} role="status">
            This browser cannot keep a copy of the recording on the phone, so keep this page open until the recording has sent.
          </p>
        )}

        {prompt && (
          <div className="flex flex-1 flex-col gap-2.5 rounded-lg bg-surface-2 p-5">
            <span className="flex items-baseline justify-between gap-3">
              <span className={eyebrow}>{promptLabel(table.prompts, prompt)}</span>
              {time && <span className="text-[0.8125rem] text-ink-3">about {time}</span>}
            </span>
            <p className="m-0 font-serif text-[1.625rem] font-semibold leading-snug">{prompt.text}</p>
            {prompt.hint && <span className="mt-auto text-sm text-ink-3">{prompt.hint}</span>}
            {tableIsAheadOrBehind(table) && roomPrompt && (
              <span className="text-sm text-ink-3">The room is on &ldquo;{roomPrompt.text}&rdquo;. Your table can move on when it&rsquo;s ready.</span>
            )}
          </div>
        )}

        {lastCallShown(table) && (
          <div className={noticeWarn} role="status">
            <strong>Last five minutes.</strong> Finish the thought, then end the conversation below.
          </div>
        )}

        <div className="flex gap-2.5">
          <button className={cn(buttonSecondary, 'flex-1')} disabled={!canBack || busy} onClick={() => movePrompt(-1)} type="button">
            ← Back
          </button>
          <button className={cn(buttonPrimary, 'flex-1')} disabled={!canNext || busy} onClick={() => movePrompt(1)} type="button">
            Next prompt →
          </button>
        </div>
        <div className="flex gap-2.5">
          <button className={cn(buttonSecondary, 'flex-1 border-ink')} disabled={busy} onClick={togglePause} type="button">
            {paused ? 'Resume' : 'Pause'}
          </button>
          {words.helpButton && (
            <button className={cn(buttonSecondary, 'flex-1 border-ink')} disabled={busy} onClick={toggleHelp} type="button">
              {help.button}
            </button>
          )}
        </div>
        {help.note && <p className={noticeInfo}>{help.note}</p>}
        <button className={cn(buttonSecondary, 'border-on-air-red text-on-air-red')} disabled={busy} onClick={() => setConfirmEnd(true)} type="button">
          End conversation
        </button>

        {queue.progress().failing && queue.error() && (
          <p className={noticeInfo} role="status">
            {queue.error()} {queue.waiting().length > 0 && `(${queue.waiting().length} waiting to send)`}
            <button className="ml-2 font-bold text-wuwf-blue-700 underline" onClick={() => onSegmentRetry(queue, bump)} type="button">
              Try now
            </button>
          </p>
        )}
        {error && (
          <p className={noticeWarn} role="alert">
            {error}
          </p>
        )}

        {confirmEnd && (
          <div className="flex flex-col gap-2.5 rounded-md border border-warning-border bg-warning-bg p-3.5" role="alertdialog" aria-labelledby="end-title">
            <strong className="text-[0.9375rem]" id="end-title">
              {words.confirmEnd}
            </strong>
            <span className="text-sm text-ink-2">{clock} recorded. You can&rsquo;t add to it afterwards.</span>
            <div className="flex gap-2.5">
              <button className={cn(buttonSecondary, 'flex-1 border-ink')} onClick={() => setConfirmEnd(false)} type="button">
                Keep going
              </button>
              <button className={cn(buttonDark, 'flex-1')} onClick={end} type="button">
                End and send
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function onSegmentRetry(queue: SegmentQueue, bump: (update: (n: number) => number) => void) {
  void queue.drain().then(() => bump((n) => n + 1))
}

const Step: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <li className="flex gap-3 rounded-md border border-rule-strong p-3.5">
    <span aria-hidden className="font-serif text-[1.375rem] font-bold leading-none text-wuwf-blue-700">
      {n}
    </span>
    <span className="text-[0.9375rem] leading-snug">{children}</span>
  </li>
)

/** An iPhone or iPad, whatever browser is on it: they all use the system's web view, and the microphone is the app's permission. */
function isIos(): boolean {
  return typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
}

/** Opening a different table's card on this phone: lets this phone go first. */
const Leave: React.FC<{ words: ReturnType<typeof tableWords> }> = ({ words }) => {
  const [left, setLeft] = useState(false)
  if (left) return <p className={noticeOk}>{words.left}</p>
  return (
    <button
      className="self-center text-sm font-semibold text-wuwf-blue-700 underline"
      onClick={async () => {
        await leaveTable()
        setLeft(true)
      }}
      type="button"
    >
      {words.leave}
    </button>
  )
}
