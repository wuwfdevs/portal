'use client'

import Link from 'next/link'
import React, { useId, useState } from 'react'

import { LISTENING_HOST_EXPECTED, LISTENING_HOST_KINDS, LISTENING_HOST_SEATS, type ListeningHostExpected, type ListeningHostKind, type ListeningHostSeats } from '@wuwf/portal-contracts'

import { sendHostRequest } from '@/app/(frontend)/listens/actions'
import { PolicyNotice } from '@/components/Account/PolicyNotice'
import { HOST_EXPECTED_LABEL, HOST_KIND_LABEL, HOST_SEATS_LABEL, checkHostRequest } from '@/lib/listening/inbox'
import { cn } from '@/utilities/ui'

import { buttonDark, checkRow, checkbox, field, hint, label, noticeOk, noticeWarn, textarea } from './styles'

/**
 * Host a listening session (board 5c). A request, not a booking: someone at WUWF reads it and writes back, and the Portal's
 * staff list flags any request that has waited more than five days, because this page says a week. Asking for a WUWF
 * journalist to join is a request too. The email is needed to write back and is used for that.
 */
export const HostForm: React.FC = () => {
  const id = useId()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [organization, setOrganization] = useState('')
  const [kind, setKind] = useState<ListeningHostKind>('invite')
  const [seats, setSeats] = useState<ListeningHostSeats>(12)
  const [expected, setExpected] = useState<ListeningHostExpected>('9-12')
  const [address, setAddress] = useState('')
  const [whenText, setWhenText] = useState('')
  const [inviteesText, setInviteesText] = useState('')
  const [journalist, setJournalist] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (sending) return
    setError(null)
    const input = { name, email, kind, organization, seats, address, expected, whenText, inviteesText, journalistRequested: journalist }
    const checked = checkHostRequest(input)
    if (!checked.ok) return setError(checked.message)
    setSending(true)
    const result = await sendHostRequest(checked.value)
    setSending(false)
    if (!result.ok) return setError(result.message)
    setSent(true)
  }

  if (sent) {
    return (
      <div className="flex max-w-xl flex-col gap-4" role="status">
        <p className={noticeOk}>
          <strong>Thank you. We have your request.</strong> Someone at WUWF will write back within a week, to the email you gave.
        </p>
        <Link className="self-start text-sm font-bold text-wuwf-blue-700 underline" href="/listens">
          Back to WUWF Listens
        </Link>
        <PolicyNotice />
      </div>
    )
  }

  return (
    <form className="flex max-w-xl flex-col gap-5" noValidate onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className={label} htmlFor={`${id}-name`}>
            Your name
          </label>
          <input autoComplete="name" className={field} id={`${id}-name`} maxLength={200} onChange={(event) => setName(event.target.value)} required type="text" value={name} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={label} htmlFor={`${id}-email`}>
            Email
          </label>
          <input autoComplete="email" className={field} id={`${id}-email`} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          <span className={hint}>So someone can write back.</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={label} htmlFor={`${id}-org`}>
          Organization (optional)
        </label>
        <input autoComplete="organization" className={field} id={`${id}-org`} maxLength={200} onChange={(event) => setOrganization(event.target.value)} type="text" value={organization} />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className={cn(label, 'mb-1')}>What kind of session</legend>
        {LISTENING_HOST_KINDS.map((choice) => (
          <label
            className={cn(
              'flex cursor-pointer flex-col rounded-sm border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-wuwf-blue-700',
              kind === choice ? 'border-ink bg-surface-2' : 'border-rule-strong bg-surface',
            )}
            key={choice}
          >
            <span className="flex items-center gap-2.5 text-base font-bold">
              <input checked={kind === choice} className="size-5 accent-wuwf-blue-700" name={`${id}-kind`} onChange={() => setKind(choice)} type="radio" value={choice} />
              {HOST_KIND_LABEL[choice].title}
            </span>
            <span className="ml-[30px] text-sm text-ink-3">{HOST_KIND_LABEL[choice].hint}</span>
          </label>
        ))}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className={label} htmlFor={`${id}-seats`}>
            Seats you could offer
          </label>
          <select className={field} id={`${id}-seats`} onChange={(event) => setSeats(Number(event.target.value) as ListeningHostSeats)} value={seats}>
            {LISTENING_HOST_SEATS.map((n) => (
              <option key={n} value={n}>
                {HOST_SEATS_LABEL[n]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={label} htmlFor={`${id}-expected`}>
            People you expect
          </label>
          <select className={field} id={`${id}-expected`} onChange={(event) => setExpected(event.target.value as ListeningHostExpected)} value={expected}>
            {LISTENING_HOST_EXPECTED.map((choice) => (
              <option key={choice} value={choice}>
                {HOST_EXPECTED_LABEL[choice]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={label} htmlFor={`${id}-address`}>
          Where it would be
        </label>
        <input autoComplete="street-address" className={field} id={`${id}-address`} maxLength={500} onChange={(event) => setAddress(event.target.value)} required type="text" value={address} />
        <span className={hint}>An address or the name of the place.</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={label} htmlFor={`${id}-when`}>
          When you have in mind
        </label>
        <input className={field} id={`${id}-when`} maxLength={500} onChange={(event) => setWhenText(event.target.value)} required type="text" value={whenText} />
        <span className={hint}>In your own words, for example “a Saturday morning in March”.</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={label} htmlFor={`${id}-invitees`}>
          Who you would invite (optional)
        </label>
        <textarea className={textarea} id={`${id}-invitees`} maxLength={2000} onChange={(event) => setInviteesText(event.target.value)} rows={3} value={inviteesText} />
      </div>

      <label className={checkRow}>
        <input checked={journalist} className={checkbox} onChange={(event) => setJournalist(event.target.checked)} type="checkbox" />
        <span>I would like a WUWF journalist to join, if one can.</span>
      </label>

      {error && (
        <p className={noticeWarn} role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button className={cn(buttonDark, 'min-h-12 px-[22px] text-base')} disabled={sending} type="submit">
          {sending ? 'Sending…' : 'Send request'}
        </button>
        <span className="text-sm text-ink-3">Someone at WUWF will write back within a week.</span>
      </div>
      <PolicyNotice />
    </form>
  )
}
