'use client'

import React, { useId, useState } from 'react'

import {
  LISTENING_INBOX_KINDS,
  MAX_INBOX_BODY_LENGTH,
  type ListeningInboxKind,
} from '@wuwf/portal-contracts'

import { sendAsk } from '@/app/(frontend)/listens/actions'
import { PolicyNotice } from '@/components/Account/PolicyNotice'
import { ASK_KIND_LABEL, checkAskMessage } from '@/lib/listening/inbox'
import { cn } from '@/utilities/ui'

import { buttonDark, field, hint, label, noticeOk, noticeWarn, textarea } from './styles'

/**
 * Ask WUWF (board 5), the card in the hero: a question for the newsroom, or an idea for a story. No account and no box to tick. An email is optional
 * and only for hearing what came of it. It says who receives it and promises no reply, no story and no date: a person reads
 * every one. The Portal keeps the message and the email, and nothing that identifies the visitor.
 */
export const AskWuwf: React.FC = () => {
  const id = useId()
  const [kind, setKind] = useState<ListeningInboxKind>('question')
  const [body, setBody] = useState('')
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (sending) return
    setError(null)
    const checked = checkAskMessage({ kind, body, email })
    if (!checked.ok) return setError(checked.message)
    setSending(true)
    const result = await sendAsk({
      kind: checked.value.kind,
      body: checked.value.body,
      email: checked.value.email,
    })
    setSending(false)
    if (!result.ok) return setError(result.message)
    setSent(true)
    setBody('')
    setEmail('')
  }

  return (
    <div
      className="flex w-full flex-col gap-4 rounded-lg border-2 border-ink bg-surface p-5 md:p-7"
      id="ask"
    >
      {sent ? (
        <div className="flex flex-col gap-3" role="status">
          <p className={noticeOk}>
            <strong>Sent to the WUWF newsroom.</strong> A person will read it.
          </p>
          <button
            className="self-start text-sm font-bold text-wuwf-blue-700 underline"
            onClick={() => setSent(false)}
            type="button"
          >
            Send another
          </button>
          <PolicyNotice />
        </div>
      ) : (
        <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
          <fieldset className="flex flex-wrap gap-2">
            <legend className={cn(label, 'mb-2')}>This is</legend>
            {LISTENING_INBOX_KINDS.map((choice) => (
              <label
                className={cn(
                  'inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-wuwf-blue-700',
                  kind === choice
                    ? 'border-ink bg-ink text-surface'
                    : 'border-rule-strong bg-surface text-ink-2',
                )}
                key={choice}
              >
                <input
                  checked={kind === choice}
                  className="sr-only"
                  name={`${id}-kind`}
                  onChange={() => setKind(choice)}
                  type="radio"
                  value={choice}
                />
                {ASK_KIND_LABEL[choice]}
              </label>
            ))}
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label
              className="font-serif text-2xl font-semibold leading-snug text-ink"
              htmlFor={`${id}-body`}
            >
              {kind === 'question' ? 'What do you want to know?' : 'What should we look into?'}
            </label>
            <textarea
              className={textarea}
              id={`${id}-body`}
              maxLength={MAX_INBOX_BODY_LENGTH}
              onChange={(event) => setBody(event.target.value)}
              rows={4}
              value={body}
            />
            <span className={hint}>
              {body.length.toLocaleString('en-US')} of{' '}
              {MAX_INBOX_BODY_LENGTH.toLocaleString('en-US')} characters
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={label} htmlFor={`${id}-email`}>
              Email, if you&apos;d like to hear what came of it (optional)
            </label>
            <input
              autoComplete="email"
              className={field}
              id={`${id}-email`}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
            <span className={hint}>We use it for that and nothing else.</span>
          </div>

          {error && (
            <p className={noticeWarn} role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <button
              className={cn(buttonDark, 'min-h-12 px-[22px] text-base')}
              disabled={sending || body.trim().length === 0}
              type="submit"
            >
              {sending ? 'Sending…' : 'Send to WUWF'}
            </button>
            <span className="min-w-[14rem] flex-1 text-sm text-ink-3">
              A person at WUWF reads every one. We can&apos;t promise a reply, a story or a date.
            </span>
          </div>
          <PolicyNotice />
        </form>
      )}
    </div>
  )
}
