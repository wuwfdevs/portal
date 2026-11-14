'use client'

import Link from 'next/link'
import React, { useId, useState } from 'react'

import { saveContactCard } from '@/app/(frontend)/listens/card-actions'
import { PolicyNotice } from '@/components/Account/PolicyNotice'
import { cardPromise, checkCard, toggleChoice, type CardChoices } from '@/lib/listening/card'
import { cn } from '@/utilities/ui'

import { buttonDark, checkRow, checkbox, field, hint, label, noticeInfo, noticeWarn } from './styles'

/**
 * Board 5i: a participant's contact card on their own phone. It takes about twenty seconds and everything but the first name is
 * optional. The three choices start off. Only WUWF journalists see the card; the person running the table never does.
 */
export const ContactCard: React.FC<{ cardToken: string; tableNumber: number; eventTitle: string }> = ({ cardToken, tableNumber, eventTitle }) => {
  const id = useId()
  const [firstName, setFirstName] = useState('')
  const [contact, setContact] = useState('')
  const [choices, setChoices] = useState<CardChoices>({ mayContact: false, mayName: false, keepAnonymous: false })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ firstName: string; warning: string | null; choices: CardChoices } | null>(null)

  const warning = checkCard({ firstName: firstName || 'x', contact, ...choices })
  const liveWarning = warning.ok ? warning.warning : null

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (sending) return
    setError(null)
    const checked = checkCard({ firstName, contact, ...choices })
    if (!checked.ok) return setError(checked.message)
    setSending(true)
    const result = await saveContactCard({ cardToken, firstName, contact, ...choices })
    setSending(false)
    if (!result.ok) return setError(result.message)
    setSent({ firstName: checked.value.firstName, warning: result.warning, choices })
  }

  if (sent) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3.5 py-6 text-center" role="status">
        <div aria-hidden className="flex size-14 items-center justify-center rounded-full border border-wuwf-lime bg-wuwf-lime-100">
          <svg className="text-lime-text" fill="none" height="24" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="24">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="font-serif text-2xl font-bold leading-tight">Thank you, {sent.firstName}.</h1>
        <p className="max-w-sm text-[0.9375rem] text-ink-2">{cardPromise(sent.choices)}</p>
        {sent.warning && <p className={noticeWarn}>{sent.warning}</p>}
        <Link className="text-[0.9375rem] font-bold" href="/listens">
          What WUWF does with tonight →
        </Link>
      </div>
    )
  }

  return (
    <form className="flex flex-1 flex-col gap-4" noValidate onSubmit={submit}>
      <h1 className="font-serif text-[1.625rem] font-bold leading-tight">You were at table {tableNumber}.</h1>
      <p className="text-[0.9375rem] text-ink-2">
        If you&rsquo;d like, leave a way for WUWF to reach you about what you said. It takes twenty seconds, and it&rsquo;s the only way we could ever name you or ask a follow-up
        question. Only your first name is needed; everything else is optional.
      </p>
      <p className="text-sm text-ink-3">{eventTitle}</p>

      <div className="flex flex-col gap-1.5">
        <label className={label} htmlFor={`${id}-first`}>
          First name
        </label>
        <input
          autoComplete="given-name"
          className={field}
          id={`${id}-first`}
          maxLength={60}
          onChange={(event) => setFirstName(event.target.value)}
          placeholder="As you said it at the table"
          required
          type="text"
          value={firstName}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className={label} htmlFor={`${id}-contact`}>
          Email or phone
        </label>
        <input
          autoComplete="email"
          className={field}
          id={`${id}-contact`}
          maxLength={320}
          onChange={(event) => setContact(event.target.value)}
          placeholder="How a reporter can reach you"
          type="text"
          value={contact}
        />
      </div>

      <fieldset className="flex flex-col gap-2.5 rounded-md bg-surface-2 p-3.5">
        <legend className="sr-only">What WUWF may do</legend>
        <label className={checkRow}>
          <input checked={choices.mayContact} className={checkbox} onChange={(event) => setChoices(toggleChoice(choices, 'mayContact', event.target.checked))} type="checkbox" />
          <span>WUWF may contact me about what I said.</span>
        </label>
        <label className={checkRow}>
          <input checked={choices.mayName} className={checkbox} onChange={(event) => setChoices(toggleChoice(choices, 'mayName', event.target.checked))} type="checkbox" />
          <span>WUWF may name me if something I said is used.</span>
        </label>
        <label className={checkRow}>
          <input checked={choices.keepAnonymous} className={checkbox} onChange={(event) => setChoices(toggleChoice(choices, 'keepAnonymous', event.target.checked))} type="checkbox" />
          <span>Please keep me anonymous.</span>
        </label>
      </fieldset>

      {liveWarning && <p className={noticeInfo}>{liveWarning}</p>}
      {error && (
        <p className={noticeWarn} role="alert">
          {error}
        </p>
      )}

      <button className={cn(buttonDark, 'mt-auto min-h-12 w-full text-base')} disabled={sending} type="submit">
        {sending ? 'Sending…' : 'Send to WUWF'}
      </button>
      <span className={cn(hint, 'text-center')}>Only WUWF journalists see this. The person running your table doesn&rsquo;t.</span>
      <PolicyNotice />
    </form>
  )
}
