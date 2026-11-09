'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

import type { ListeningQuery, ListeningQuestion } from '@wuwf/portal-contracts'
import { MAX_TEXT_ANSWER_LENGTH } from '@wuwf/portal-contracts'
import { formatStopwatch, participantFields, submitBlockedReason, type ParticipantFieldKey } from '@wuwf/listening-core'

import { finalizeResponse, saveDetails, saveTextAnswer, startResponse } from '@/app/(frontend)/listens/actions'
import { PolicyNotice } from '@/components/Account/PolicyNotice'
import {
  EMPTY_CONSENT,
  EMPTY_DETAILS,
  answerFor,
  answersFromProgress,
  consentChoices,
  consentToWire,
  contactWithoutWay,
  detailsToWire,
  doneText,
  introSummary,
  limitLabel,
  missingDetails,
  progressPercent,
  questionFooter,
  readiness,
  reviewBlockedText,
  reviewRows,
  stepTitle,
  type ConsentDraft,
  type DetailsDraft,
  type LocalAnswer,
  type Screen,
} from '@/lib/listening/flow'
import { saveAudioAnswer } from '@/lib/listening/send-answer'
import { cn } from '@/utilities/ui'

import { answerSteps } from './answer-steps'
import { ListenBack } from './ListenBack'
import { buttonDark, buttonLink, buttonPrimary, buttonSecondary, checkRow, checkbox, field, hint, label, noticeInfo, noticeWarn, textarea } from './styles'
import { useRecorder } from './useRecorder'

/**
 * The full question set (boards 5b and 6-H): intro, microphone, one screen per question, review, a little about you,
 * permissions and consent, sending, received. It stores nothing: every answer goes to the Portal through the server actions
 * the moment it is saved, and the audio goes straight from this browser to the Portal's storage. A reloaded page resumes the
 * answers the Portal already holds. The rules (the open window, required answers, caps, consent) are the Portal's; this
 * explains them before the button and shows what the Portal answers.
 */
export const QuestionSet: React.FC<{ query: ListeningQuery }> = ({ query }) => {
  const questions = query.questions
  const writing = query.allowTextAnswers

  const [screen, setScreen] = useState<Screen>('intro')
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>({})
  const [modes, setModes] = useState<Record<string, 'audio' | 'text'>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [details, setDetails] = useState<DetailsDraft>(EMPTY_DETAILS)
  const [consent, setConsent] = useState<ConsentDraft>(EMPTY_CONSENT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneCount, setDoneCount] = useState(0)

  const question = questions[index] as ListeningQuestion
  const recorder = useRecorder(question.maxDurationSeconds)
  const heading = useRef<HTMLHeadingElement | null>(null)

  // A new screen or question moves focus to its heading, so a keyboard or screen-reader user lands where the page changed.
  useEffect(() => {
    heading.current?.focus()
  }, [screen, index])

  const current = answerFor(answers, question.id)
  const mode = writing ? (modes[question.id] ?? 'audio') : 'audio'
  const ready = readiness(questions, answers)
  const fields = useMemo(() => participantFields(query.fields), [query.fields])
  const asks = consentChoices(query)

  const go = (next: Screen) => {
    setError(null)
    setScreen(next)
  }
  const patch = (questionId: string, value: Partial<LocalAnswer>) =>
    setAnswers((all) => ({ ...all, [questionId]: { ...answerFor(all, questionId), ...value } }))
  const open = (questionIndex: number) => {
    recorder.discard()
    setError(null)
    setIndex(questionIndex)
    setScreen('question')
  }
  const advance = () => {
    recorder.discard()
    setError(null)
    if (index === questions.length - 1) setScreen('review')
    else setIndex(index + 1)
  }

  // -- intro: open (or resume) this visitor's response ------------------------------------------------------------
  const begin = async () => {
    setBusy(true)
    setError(null)
    const started = await startResponse(query.publicId)
    setBusy(false)
    if (!started.ok) return setError(started.message)
    setSubmissionId(started.submissionId)
    setAnswers(answersFromProgress(questions, started.answers))
    setScreen('mic')
  }

  // -- question: save the take or the written words ---------------------------------------------------------------
  const saveRecording = async () => {
    if (!submissionId || !recorder.take) return
    setBusy(true)
    setError(null)
    const take = recorder.take
    const saved = await saveAudioAnswer(answerSteps, { submissionId, questionId: question.id, blob: take.blob, durationMs: take.durationMs })
    setBusy(false)
    if (!saved.ok) return setError(saved.message)
    patch(question.id, { state: 'saved', seconds: take.seconds, text: null, retake: false })
    advance()
  }

  const saveWriting = async () => {
    if (!submissionId) return
    const text = (drafts[question.id] ?? '').trim()
    if (!text) return setError('Write something first, or choose another way to answer.')
    setBusy(true)
    setError(null)
    const saved = await saveTextAnswer({ submissionId, questionId: question.id, text })
    setBusy(false)
    if (!saved.ok) return setError(saved.message)
    patch(question.id, { state: 'saved', seconds: null, text, retake: false })
    advance()
  }

  // -- details and consent, then send --------------------------------------------------------------------------------
  const toConsent = () => {
    const missing = missingDetails(query, details)
    if (missing.length > 0) {
      const labels = fields.filter((f) => missing.includes(f.key)).map((f) => f.label)
      return setError(`Please fill in: ${labels.join(', ')}.`)
    }
    go('consent')
  }

  const submit = async () => {
    if (!submissionId) return
    setError(null)
    setScreen('submitting')
    const savedDetails = await saveDetails({ submissionId, details: detailsToWire(details), consent: consentToWire(query, consent) })
    if (!savedDetails.ok) {
      setScreen('consent')
      return setError(savedDetails.message)
    }
    const sent = await finalizeResponse({ submissionId, consentAgreed: consent.agreed })
    if (!sent.ok) {
      setScreen('consent')
      return setError(sent.message)
    }
    setDoneCount(sent.answers)
    setScreen('done')
  }

  const blocked = reviewBlockedText(questions, answers)
  const consentBlocked = !consent.agreed ? submitBlockedReason(ready, false, []) : null
  const percent = progressPercent(screen, index, questions.length)

  return (
    <div className="mx-auto w-full max-w-xl overflow-hidden rounded-md border border-rule bg-surface shadow-2">
      {screen !== 'done' && (
        <div aria-hidden="true" className="h-[3px] bg-surface-3">
          <div className="h-full bg-wuwf-blue transition-[width] duration-300 ease-out" style={{ width: `${percent}%` }} />
        </div>
      )}

      <div className="flex flex-col gap-4 px-5 py-8 sm:px-8">
        <h1 className="font-serif text-[1.375rem] font-bold leading-snug text-ink outline-none" ref={heading} tabIndex={-1}>
          {stepTitle(screen, query, index, questions.length)}
        </h1>

        {error && (
          <p className={noticeWarn} role="alert">
            {error}
          </p>
        )}

        {screen === 'intro' && (
          <div className="flex flex-col gap-4">
            {query.intro && <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-ink-2">{query.intro}</p>}
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-4">{introSummary(query)}</p>
            <p className={noticeInfo}>
              Your answers go to WUWF for editorial review and will not be published automatically. WUWF may use one answer without using the others, and
              submitting doesn&apos;t guarantee use or a reply.
            </p>
            <button className={cn(buttonPrimary, 'w-full')} disabled={busy} onClick={begin} type="button">
              {busy ? 'Opening…' : 'Begin'}
            </button>
          </div>
        )}

        {screen === 'mic' && (
          <div className="flex flex-col gap-4">
            <p className="text-[0.9375rem] leading-relaxed text-ink-2">
              WUWF needs access to your microphone. You&apos;ll only be asked once. Recording starts when you press Start recording, and stops when you press Stop.
            </p>
            {recorder.mic !== 'ready' && (
              <>
                {recorder.guidance && (
                  <div className={noticeWarn} role="alert">
                    <p>{recorder.guidance.message}</p>
                    {recorder.guidance.offerNewTab && (
                      <a className="mt-2 inline-block font-semibold underline" href={typeof window === 'undefined' ? '#' : window.location.href} rel="noopener" target="_blank">
                        Open this in its own tab
                      </a>
                    )}
                  </div>
                )}
                <button className={cn(buttonPrimary, 'w-full')} onClick={() => void recorder.acquire()} type="button">
                  {recorder.guidance?.offerRetry ? 'Try again' : 'Allow microphone access'}
                </button>
                {writing && recorder.mic === 'blocked' && (
                  <button
                    className={buttonLink}
                    onClick={() => {
                      setModes(Object.fromEntries(questions.map((q) => [q.id, 'text' as const])))
                      open(0)
                    }}
                    type="button"
                  >
                    Write my answers instead
                  </button>
                )}
              </>
            )}
            {recorder.mic === 'ready' && (
              <>
                <p className="flex items-center gap-2.5 rounded-sm border border-wuwf-lime bg-wuwf-lime-100 px-3.5 py-3 text-sm font-semibold text-success-fg">
                  <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-success-fg" />
                  Microphone ready
                </p>
                <button className={cn(buttonPrimary, 'w-full')} onClick={() => open(0)} type="button">
                  Continue to question 1
                </button>
              </>
            )}
          </div>
        )}

        {screen === 'question' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex min-h-5 items-center rounded-full px-2 text-[0.6875rem] font-bold uppercase tracking-[0.04em]',
                  question.required ? 'bg-wuwf-blue-100 text-wuwf-blue-700' : 'bg-surface-3 text-ink-2',
                )}
              >
                {question.required ? 'Required' : 'Optional'}
              </span>
              <span className="text-xs text-ink-3">Up to {limitLabel(question)}</span>
            </div>
            <p className="font-serif text-xl font-bold leading-snug text-ink">{question.prompt}</p>
            {question.guidance && <p className="text-sm leading-relaxed text-ink-3">{question.guidance}</p>}

            {writing && current.state !== 'saved' && !recorder.take && recorder.phase !== 'recording' && (
              <div aria-label="How to answer" className="inline-flex self-start rounded-full bg-surface-2 p-1" role="tablist">
                {(['audio', 'text'] as const).map((choice) => (
                  <button
                    aria-selected={mode === choice}
                    className={cn('min-h-10 rounded-full px-4 text-sm font-bold', mode === choice ? 'bg-ink text-surface' : 'bg-transparent text-ink-2')}
                    key={choice}
                    onClick={() => setModes((all) => ({ ...all, [question.id]: choice }))}
                    role="tab"
                    type="button"
                  >
                    {choice === 'audio' ? 'Record' : 'Write'}
                  </button>
                ))}
              </div>
            )}

            {/* Saved: the Portal has this answer. */}
            {current.state === 'saved' && !current.retake && (
              <div className="flex flex-col gap-3 rounded-sm border border-wuwf-lime bg-wuwf-lime-100 p-4">
                <p className="text-sm font-bold text-success-fg">Saved — WUWF has this answer</p>
                {current.text && <p className="whitespace-pre-wrap text-sm text-ink-2">{current.text}</p>}
                <div className="flex gap-2.5">
                  <button className={cn(buttonSecondary, 'flex-1')} onClick={() => patch(question.id, { retake: true })} type="button">
                    Replace this answer
                  </button>
                  <button className={cn(buttonPrimary, 'flex-1')} onClick={advance} type="button">
                    {index === questions.length - 1 ? 'Review answers' : 'Next question'}
                  </button>
                </div>
              </div>
            )}

            {/* Recording now. */}
            {recorder.phase === 'recording' && (
              <div className="flex flex-col items-center gap-3.5 py-4">
                <p className="flex items-center gap-2 text-sm font-bold text-on-air-red">
                  <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-on-air-red" />
                  Recording
                </p>
                <div aria-hidden="true" className="flex h-12 items-end gap-[3px]">
                  {Array.from({ length: 28 }, (_, i) => (
                    <span className="block w-1 rounded-sm bg-wuwf-blue" key={i} style={{ height: 10 + Math.round(20 * Math.abs(Math.sin((i + recorder.elapsed * 3) * 0.7))) }} />
                  ))}
                </div>
                <p className="font-mono text-[0.9375rem] text-ink-2" role="timer">
                  {formatStopwatch(recorder.elapsed)}
                  <span className="text-ink-4"> / {formatStopwatch(question.maxDurationSeconds)}</span>
                </p>
                <button className={buttonDark} onClick={recorder.stop} type="button">
                  Stop recording
                </button>
              </div>
            )}

            {/* Recorded, not yet sent. */}
            {recorder.phase === 'recorded' && recorder.take && (
              <div className="flex flex-col gap-3 rounded-sm border border-rule bg-surface-2 p-4">
                <p className="text-sm font-bold text-ink">Recorded — {formatStopwatch(recorder.take.seconds)}</p>
                <ListenBack blob={recorder.take.blob} seconds={recorder.take.seconds} />
                <div className="flex gap-2.5">
                  <button className={cn(buttonSecondary, 'flex-1')} disabled={busy} onClick={recorder.discard} type="button">
                    Redo this answer
                  </button>
                  <button className={cn(buttonPrimary, 'flex-1')} disabled={busy} onClick={saveRecording} type="button">
                    {busy ? 'Saving…' : index === questions.length - 1 ? 'Save and review' : 'Save and continue'}
                  </button>
                </div>
              </div>
            )}

            {/* Nothing yet, or replacing a saved answer. */}
            {recorder.phase === 'idle' && (current.state !== 'saved' || current.retake) && (
              <div className="flex flex-col gap-3">
                {current.retake && (
                  <p className={noticeInfo}>Recording again replaces the answer WUWF already has for this question. Nothing else you&apos;ve sent is affected.</p>
                )}

                {mode === 'audio' ? (
                  <div className="flex flex-col items-center gap-3.5 py-3">
                    <button
                      aria-label="Start recording"
                      className="flex size-16 items-center justify-center rounded-full bg-wuwf-blue-700 text-surface hover:bg-wuwf-blue-600"
                      onClick={() => void recorder.start()}
                      type="button"
                    >
                      <svg aria-hidden="true" fill="currentColor" height="22" viewBox="0 0 24 24" width="22">
                        <circle cx="12" cy="12" r="9" />
                      </svg>
                    </button>
                    <span className="text-sm text-ink-3">Press to start recording</span>
                    {recorder.guidance && (
                      <p className={noticeWarn} role="alert">
                        {recorder.guidance.message}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <label className={label} htmlFor="ql-text">
                      Your answer
                    </label>
                    <textarea
                      className={textarea}
                      id="ql-text"
                      maxLength={MAX_TEXT_ANSWER_LENGTH}
                      onChange={(event) => setDrafts((all) => ({ ...all, [question.id]: event.target.value }))}
                      rows={5}
                      value={drafts[question.id] ?? current.text ?? ''}
                    />
                    <button className={cn(buttonPrimary, 'w-full')} disabled={busy} onClick={saveWriting} type="button">
                      {busy ? 'Saving…' : index === questions.length - 1 ? 'Save and review' : 'Save and continue'}
                    </button>
                  </div>
                )}

                {current.retake && (
                  <button className={cn(buttonLink, 'self-center')} onClick={() => patch(question.id, { retake: false })} type="button">
                    Keep the answer I already sent
                  </button>
                )}
                {current.state !== 'saved' && !question.required && (
                  <button
                    className={cn(buttonLink, 'self-center')}
                    onClick={() => {
                      patch(question.id, { state: 'skipped' })
                      advance()
                    }}
                    type="button"
                  >
                    Skip this question — it&apos;s optional
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
              <p className="text-xs text-ink-4">{questionFooter(index, questions.length, ready.savedCount)}</p>
              <div className="flex gap-3">
                {index > 0 && recorder.phase !== 'recording' && (
                  <button className={buttonLink} onClick={() => open(index - 1)} type="button">
                    ← Previous question
                  </button>
                )}
                {recorder.phase === 'idle' && current.state !== 'saved' && (
                  <button className={buttonLink} onClick={advance} type="button">
                    Come back to this later →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {screen === 'review' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-ink-3">You can replace any recording before you continue.</p>
            <ul className="flex flex-col gap-2">
              {reviewRows(questions, answers).map((row) => (
                <li className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-rule px-4 py-3" key={row.questionId}>
                  <div className="flex min-w-60 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-semibold text-ink">{row.prompt}</span>
                    <span className="text-xs text-ink-3">{row.status}</span>
                  </div>
                  <button
                    className={buttonLink}
                    onClick={() => {
                      if (row.action === 'Replace') patch(row.questionId, { retake: true })
                      open(row.position - 1)
                    }}
                    type="button"
                  >
                    {row.action}
                  </button>
                </li>
              ))}
            </ul>
            {blocked && <p className={noticeWarn}>{blocked}</p>}
            <button className={cn(buttonPrimary, 'w-full')} disabled={blocked !== null} onClick={() => go('info')} type="button">
              Continue
            </button>
          </div>
        )}

        {screen === 'info' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-ink-3">{fields.some((f) => f.mode === 'required') ? 'Fields marked required are needed to send.' : 'Everything here is optional.'}</p>
            {fields.map((spec) => {
              const id = `ql-${spec.key}`
              const value = details[spec.key as ParticipantFieldKey]
              const onChange = (next: string) => setDetails((all) => ({ ...all, [spec.key]: next }))
              return (
                <div className="flex flex-col gap-1.5" key={spec.key}>
                  <label className={label} htmlFor={id}>
                    {spec.label}
                    {spec.mode === 'optional' ? ' (optional)' : ''}
                  </label>
                  {spec.kind === 'textarea' ? (
                    <textarea className={textarea} id={id} maxLength={spec.maxLength} onChange={(e) => onChange(e.target.value)} rows={3} value={value} />
                  ) : (
                    <input
                      autoComplete={spec.kind === 'email' ? 'email' : spec.kind === 'tel' ? 'tel' : spec.key === 'name' ? 'name' : 'off'}
                      className={field}
                      id={id}
                      maxLength={spec.maxLength}
                      onChange={(e) => onChange(e.target.value)}
                      required={spec.mode === 'required'}
                      type={spec.kind}
                      value={value}
                    />
                  )}
                  {spec.hint && <span className={hint}>{spec.hint}</span>}
                </div>
              )
            })}
            <div className="flex gap-2.5">
              <button className={cn(buttonSecondary, 'flex-1')} onClick={() => go('review')} type="button">
                Back
              </button>
              <button className={cn(buttonPrimary, 'flex-1')} onClick={toConsent} type="button">
                Continue
              </button>
            </div>
          </div>
        )}

        {screen === 'consent' && (
          <div className="flex flex-col gap-3.5">
            {asks.contact && (
              <label className={checkRow}>
                <input checked={consent.contact} className={checkbox} onChange={(e) => setConsent((c) => ({ ...c, contact: e.target.checked }))} type="checkbox" />
                WUWF may contact me about my responses.
              </label>
            )}
            {contactWithoutWay(details, consent, query) && (
              <p className={noticeInfo}>You haven&apos;t given an email or phone number, so there&apos;s no way to reach you. Go back and add one if you&apos;d like to be contacted.</p>
            )}
            {asks.identify && (
              <label className={checkRow}>
                <input checked={consent.identify} className={checkbox} onChange={(e) => setConsent((c) => ({ ...c, identify: e.target.checked }))} type="checkbox" />
                WUWF may identify me by name if one or more of my responses is used.
              </label>
            )}
            {asks.anonymous && (
              <label className={checkRow}>
                <input checked={consent.requestAnonymous} className={checkbox} onChange={(e) => setConsent((c) => ({ ...c, requestAnonymous: e.target.checked }))} type="checkbox" />
                Please consider my responses anonymously.
              </label>
            )}
            <p className="whitespace-pre-wrap rounded-sm border border-rule bg-surface-2 p-3.5 text-xs leading-relaxed text-ink-2">{query.consentText}</p>
            <label className={checkRow}>
              <input checked={consent.agreed} className={checkbox} onChange={(e) => setConsent((c) => ({ ...c, agreed: e.target.checked }))} type="checkbox" />
              I have read and agree to these terms.
            </label>
            <div className="flex gap-2.5">
              <button className={cn(buttonSecondary, 'flex-1')} onClick={() => go('info')} type="button">
                Back
              </button>
              <button className={cn(buttonPrimary, 'flex-1 px-2')} disabled={!consent.agreed} onClick={submit} type="button">
                Submit my response
              </button>
            </div>
            {consentBlocked && <p className="text-xs text-ink-4">{consentBlocked}</p>}
          </div>
        )}

        {screen === 'submitting' && (
          <div aria-live="polite" className="flex flex-col items-center gap-3 py-2 text-center">
            <p className="text-[0.9375rem] leading-relaxed text-ink-2">Please keep this page open until this finishes.</p>
            <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-wuwf-blue" />
            </div>
            <p className="text-xs text-ink-4">Sending…</p>
          </div>
        )}

        {screen === 'done' && (
          <div className="flex flex-col items-center gap-4 py-1 text-center">
            <div aria-hidden="true" className="flex size-[52px] items-center justify-center rounded-full border border-wuwf-lime bg-wuwf-lime-100">
              <svg fill="none" height="22" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="22" className="text-success-fg">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-[0.9375rem] leading-relaxed text-ink-2">{doneText(doneCount)}</p>
            <p className={cn(noticeInfo, 'w-full text-left')}>
              A reporter may contact you only if you gave permission. Nothing here is published automatically, and submitting doesn&apos;t guarantee a reply.
            </p>
            <p className="text-xs text-ink-4">— WUWF Public Media, Pensacola, FL</p>
          </div>
        )}

        <div className="mt-2 text-center">
          <PolicyNotice />
        </div>
      </div>
    </div>
  )
}
