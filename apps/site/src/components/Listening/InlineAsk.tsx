'use client'

import Link from 'next/link'
import React, { useState } from 'react'

import { MAX_TEXT_ANSWER_LENGTH, type ListeningQuery, type ListeningQuestion } from '@wuwf/portal-contracts'
import { describeDuration, formatStopwatch } from '@wuwf/listening-core'

import { finalizeResponse, saveDetails, saveTextAnswer, startResponse } from '@/app/(frontend)/listens/actions'
import { PolicyNotice } from '@/components/Account/PolicyNotice'
import { EMPTY_DETAILS, detailsToWire } from '@/lib/listening/flow'
import { inlineEyebrow, otherQuestionCount, recipientName } from '@/lib/listening/inline'
import { saveAudioAnswer } from '@/lib/listening/send-answer'
import { cn } from '@/utilities/ui'

import { answerSteps } from './answer-steps'
import { ListenBack } from './ListenBack'
import { buttonDark, buttonPrimary, buttonSecondary, checkRow, checkbox, eyebrow, field, noticeWarn, textarea } from './styles'
import { useRecorder } from './useRecorder'

/**
 * The one-question asks. B sits in a story, C at the head of a topic page, D at the end of an episode or video (board 6). All
 * three answer the query's FIRST question and send the response as a whole through the same server actions as the full set;
 * the Portal enforces every rule. One listening component to a page: the caller places exactly one.
 */
export type InlineVariant = 'story' | 'topic' | 'voice'

interface Props {
  query: ListeningQuery
  question: ListeningQuestion
  variant: InlineVariant
  /** Where "answer all N questions" and the invitation go. */
  fullSetHref: string
  /** Where "See what others asked" goes after sending. */
  hubHref: string
  /** Voice-first only: who receives the message, and a line about what happens to it. */
  recipient?: string
  description?: string
}

const MicIcon: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg aria-hidden="true" className={className} fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width={size}>
    <rect height="11" rx="3" width="6" x="9" y="3" />
    <path d="M5 11a7 7 0 0014 0M12 18v3" />
  </svg>
)

export const InlineAsk: React.FC<Props> = ({ query, question, variant, fullSetHref, hubHref, recipient, description }) => {
  const writeAllowed = query.allowTextAnswers
  const [mode, setMode] = useState<'write' | 'record'>(variant === 'voice' || !writeAllowed ? 'record' : 'write')
  const [opened, setOpened] = useState(variant !== 'topic')
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recorder = useRecorder(question.maxDurationSeconds)

  const to = variant === 'voice' ? (recipient ?? 'WUWF') : recipientName(query)
  const others = otherQuestionCount(query)
  const showName = query.fields.name === 'required' || (variant !== 'voice' && query.fields.name !== 'hidden')
  const showEmail = query.fields.email === 'required' || (variant !== 'voice' && query.fields.email !== 'hidden')
  const recorded = mode === 'record' && recorder.phase === 'recorded' && recorder.take
  const hasAnswer = mode === 'write' ? text.trim().length > 0 : Boolean(recorded)
  const ready = agreed && hasAnswer && !sending
  const termsLine = query.askContactPermission ? 'WUWF may contact me about this answer. I have read and agree to ' : 'I have read and agree to '

  const send = async () => {
    setError(null)
    setSending(true)
    const started = await startResponse(query.publicId)
    if (!started.ok) {
      setSending(false)
      return setError(started.message)
    }
    const saved =
      mode === 'write'
        ? await saveTextAnswer({ submissionId: started.submissionId, questionId: question.id, text })
        : recorder.take
          ? await saveAudioAnswer(answerSteps, { submissionId: started.submissionId, questionId: question.id, blob: recorder.take.blob, durationMs: recorder.take.durationMs })
          : null
    if (!saved || !saved.ok) {
      setSending(false)
      return setError(saved ? saved.message : 'Record or write an answer first.')
    }
    const details = detailsToWire({ ...EMPTY_DETAILS, name: showName ? name : '', email: showEmail ? email : '' })
    const detailsResult = await saveDetails({
      submissionId: started.submissionId,
      details,
      consent: { contact: query.askContactPermission, identify: false, requestAnonymous: false },
    })
    if (!detailsResult.ok) {
      setSending(false)
      return setError(detailsResult.message)
    }
    const finalized = await finalizeResponse({ submissionId: started.submissionId, consentAgreed: true })
    setSending(false)
    if (!finalized.ok) return setError(finalized.message)
    setSent(true)
  }

  const terms = (
    <label className={cn(checkRow, variant === 'voice' && 'text-surface')}>
      <input checked={agreed} className={checkbox} onChange={(event) => setAgreed(event.target.checked)} type="checkbox" />
      <span>
        {variant === 'voice' ? `${to} may play this on the show and may contact me about it. I have read and agree to ` : termsLine}
        <details className="mt-1 inline">
          <summary className={cn('inline cursor-pointer font-bold underline', variant === 'voice' && 'text-wuwf-lime')}>the terms</summary>
          <span className={cn('mt-2 block whitespace-pre-wrap rounded-sm p-3 text-xs leading-relaxed', variant === 'voice' ? 'bg-surface/10 text-surface' : 'border border-rule bg-surface-2 text-ink-2')}>
            {query.consentText}
          </span>
        </details>
      </span>
    </label>
  )

  const details = (showName || showEmail) && (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {showName && (
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Name{query.fields.name === 'required' ? '' : ' (optional)'}
          <input autoComplete="name" className={field} onChange={(event) => setName(event.target.value)} required={query.fields.name === 'required'} type="text" value={name} />
        </label>
      )}
      {showEmail && (
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Email{query.fields.email === 'required' ? '' : ' (optional)'}
          <input autoComplete="email" className={field} onChange={(event) => setEmail(event.target.value)} required={query.fields.email === 'required'} type="email" value={email} />
        </label>
      )}
    </div>
  )

  const recorderBlock = (
    <div className={cn('flex flex-wrap items-center gap-4 rounded-sm p-4', variant === 'voice' ? '' : 'bg-surface-2')}>
      {recorder.phase === 'recorded' && recorder.take ? (
        <div className="flex min-w-60 flex-1 flex-col gap-2">
          <strong className="text-base">Recorded · {formatStopwatch(recorder.take.seconds)}</strong>
          <ListenBack blob={recorder.take.blob} seconds={recorder.take.seconds} />
        </div>
      ) : (
        <>
          <button
            aria-label={recorder.phase === 'recording' ? 'Stop recording' : 'Start recording'}
            className={cn('flex size-14 shrink-0 items-center justify-center rounded-full text-surface', recorder.phase === 'recording' ? 'bg-on-air-red' : 'bg-wuwf-blue-700 hover:bg-wuwf-blue-600')}
            onClick={() => (recorder.phase === 'recording' ? recorder.stop() : void recorder.start())}
            type="button"
          >
            <MicIcon size={20} />
          </button>
          <span className="flex min-w-44 flex-1 flex-col">
            <strong className="text-base" role={recorder.phase === 'recording' ? 'timer' : undefined}>
              {recorder.phase === 'recording' ? `Recording… ${formatStopwatch(recorder.elapsed)}` : 'Tap to record your answer'}
            </strong>
            <span className="text-sm text-ink-3">Up to {describeDuration(question.maxDurationSeconds)}. Listen back before you send.</span>
          </span>
        </>
      )}
      {recorder.phase === 'recorded' && (
        <button className={buttonSecondary} onClick={recorder.discard} type="button">
          Redo
        </button>
      )}
      {recorder.guidance && recorder.mic === 'blocked' && (
        <p className={cn(noticeWarn, 'w-full')} role="alert">
          {recorder.guidance.message}
        </p>
      )}
    </div>
  )

  const failure = error && (
    <p className={noticeWarn} role="alert">
      {error}
    </p>
  )

  // ---- D · voice first -----------------------------------------------------------------------------------------------
  if (variant === 'voice') {
    return (
      <section aria-label="WUWF Listens" className="flex flex-col gap-4 rounded-lg bg-wuwf-teal p-6 text-surface">
        <div className="flex flex-wrap items-center gap-[18px]">
          <button
            aria-label={recorder.phase === 'recording' ? 'Stop recording' : 'Record a message'}
            className={cn('flex size-16 shrink-0 items-center justify-center rounded-full text-surface', recorder.phase === 'recording' ? 'bg-on-air-red' : 'bg-surface-dark')}
            disabled={sent}
            onClick={() => (recorder.phase === 'recording' ? recorder.stop() : void recorder.start())}
            type="button"
          >
            <MicIcon size={24} />
          </button>
          <span className="flex min-w-64 flex-1 flex-col gap-1">
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-wuwf-lime">{inlineEyebrow(query)}</span>
            <strong className="text-[1.1875rem]" role={recorder.phase === 'recording' ? 'timer' : undefined}>
              {recorder.phase === 'recording'
                ? `Recording… ${formatStopwatch(recorder.elapsed)}`
                : recorder.take
                  ? `Recorded · ${formatStopwatch(recorder.take.seconds)}. Listen back, then send.`
                  : question.prompt}
            </strong>
            <span className="text-sm text-wuwf-blue-100">{description ?? `Up to ${describeDuration(question.maxDurationSeconds)}.`}</span>
          </span>
        </div>
        {recorder.guidance && recorder.mic === 'blocked' && (
          <p className="rounded-sm bg-surface/10 p-3 text-sm" role="alert">
            {recorder.guidance.message}
          </p>
        )}
        {recorder.phase === 'recorded' && recorder.take && !sent && (
          <div className="flex flex-col gap-3 border-t border-surface/20 pt-4">
            <ListenBack blob={recorder.take.blob} seconds={recorder.take.seconds} />
            {details}
            {terms}
            {error && (
              <p className="rounded-sm bg-surface/10 p-3 text-sm" role="alert">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2.5">
              <button className="inline-flex min-h-12 items-center justify-center rounded-sm bg-wuwf-lime px-5 text-[0.9375rem] font-bold text-surface-dark disabled:bg-surface/20 disabled:text-surface/60" disabled={!ready} onClick={send} type="button">
                {sending ? 'Sending…' : 'Send to the show'}
              </button>
              <button className="inline-flex min-h-12 items-center justify-center rounded-sm border border-surface/50 px-4 text-[0.9375rem] font-bold text-surface" disabled={sending} onClick={() => { recorder.discard(); setAgreed(false) }} type="button">
                Redo
              </button>
            </div>
          </div>
        )}
        {sent && (
          <p className="rounded-sm border border-surface/25 bg-surface/10 p-3.5 text-[0.9375rem]">
            <strong>Sent to {to}.</strong> Nothing airs without your OK.
          </p>
        )}
        <div className="text-sm text-surface/80 [&_a]:text-surface [&_p]:text-surface/80">
          <PolicyNotice />
        </div>
      </section>
    )
  }

  // ---- C · topic header ---------------------------------------------------------------------------------------------------
  if (variant === 'topic' && !opened && !sent) {
    return (
      <section aria-label="WUWF Listens" className="flex flex-wrap items-center gap-2.5 bg-wuwf-blue-100 px-6 py-3.5">
        <span className="shrink-0 text-[0.9375rem] font-bold text-ink">{question.prompt}</span>
        {writeAllowed ? (
          <input aria-label={question.prompt} className={cn(field, 'flex-1 basis-56')} onChange={(event) => setText(event.target.value)} onFocus={() => setOpened(true)} placeholder="Type your answer" type="text" value={text} />
        ) : (
          <span className="flex-1" />
        )}
        <button className={buttonPrimary} onClick={() => setOpened(true)} type="button">
          {writeAllowed ? 'Ask' : 'Record an answer'}
        </button>
      </section>
    )
  }

  // ---- A shared card for B and the opened C ---------------------------------------------------------------------------
  const body = sent ? (
    <p className="rounded-sm border border-wuwf-lime-600 bg-wuwf-lime-100 p-4 text-[0.9375rem]">
      <strong>Sent to {to}.</strong>{' '}
      {variant === 'story' ? 'WUWF may use your answer, and may contact you only if you said so. ' : 'Nothing is published automatically. '}
      <Link className="font-bold" href={hubHref}>
        See what others asked
      </Link>
    </p>
  ) : (
    <div className="flex flex-col gap-3">
      {writeAllowed && (
        <div aria-label="How to answer" className="inline-flex self-start rounded-full bg-surface-2 p-1" role="tablist">
          {(['write', 'record'] as const).map((choice) => (
            <button
              aria-selected={mode === choice}
              className={cn('min-h-10 rounded-full px-[18px] text-sm font-bold', mode === choice ? 'bg-ink text-surface' : 'bg-transparent text-ink-2')}
              key={choice}
              onClick={() => setMode(choice)}
              role="tab"
              type="button"
            >
              {choice === 'write' ? 'Write' : 'Record'}
            </button>
          ))}
        </div>
      )}
      {mode === 'write' ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold" htmlFor={`ia-text-${question.id}`}>
            {variant === 'topic' ? question.prompt : 'Your answer'}
          </label>
          <textarea className={textarea} id={`ia-text-${question.id}`} maxLength={MAX_TEXT_ANSWER_LENGTH} onChange={(event) => setText(event.target.value)} rows={3} value={text} />
        </div>
      ) : (
        recorderBlock
      )}
      {details}
      {terms}
      {failure}
      <div className="flex flex-wrap items-center gap-3">
        <button className={cn(variant === 'story' ? buttonDark : buttonPrimary, 'min-h-12 px-[22px] text-base')} disabled={!ready} onClick={send} type="button">
          {sending ? 'Sending…' : `Send to ${to}`}
        </button>
        {variant === 'topic' && writeAllowed && mode === 'write' && (
          <button className={cn(buttonSecondary, 'min-h-12')} onClick={() => setMode('record')} type="button">
            <MicIcon size={16} className="mr-2" />
            Record instead
          </button>
        )}
        {others > 0 && (
          <Link className="text-sm font-bold" href={fullSetHref}>
            Answer all {others + 1} questions instead →
          </Link>
        )}
      </div>
      <span className="text-sm text-ink-3">Goes to WUWF for editorial review. Nothing is published automatically.</span>
      <PolicyNotice />
    </div>
  )

  if (variant === 'topic') {
    return (
      <section aria-label="WUWF Listens" className="flex flex-col gap-3 bg-wuwf-blue-100 px-6 py-5">
        <span className={eyebrow}>
          {inlineEyebrow(query)}
          {query.askedBy ? ` · asked by ${query.askedBy}` : ''}
        </span>
        {body}
      </section>
    )
  }

  return (
    <section aria-label="WUWF Listens" className="flex flex-col gap-3 rounded-lg border-2 border-ink bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={cn(eyebrow, 'inline-flex items-center gap-2')}>
          <MicIcon size={16} />
          {inlineEyebrow(query)}
        </span>
        {query.askedBy && <span className="text-[0.8125rem] text-ink-3">Asked by {query.askedBy}</span>}
      </div>
      <h2 className="font-serif text-[1.5625rem] leading-tight text-ink">{question.prompt}</h2>
      {body}
    </section>
  )
}
