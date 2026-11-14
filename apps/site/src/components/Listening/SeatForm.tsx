'use client'

import Link from 'next/link'
import React, { useId, useState } from 'react'

import { saveSeat } from '@/app/(frontend)/listens/event-actions'
import { PolicyNotice } from '@/components/Account/PolicyNotice'
import { checkSeat } from '@/lib/listening/event'
import { cn } from '@/utilities/ui'

import { buttonDark, field, hint, label, noticeOk, noticeWarn } from './styles'

/**
 * Save a seat at a public listening session. The name and email are used for this event and nothing else; nothing promises more
 * than that the seat is saved. A full event says so before anyone types, and the Portal still refuses a seat past the limit.
 */
export const SeatForm: React.FC<{ publicId: string }> = ({ publicId }) => {
  const id = useId()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (sending) return
    setError(null)
    const checked = checkSeat({ name, email })
    if (!checked.ok) return setError(checked.message)
    setSending(true)
    const result = await saveSeat({ publicId, ...checked.value })
    setSending(false)
    if (!result.ok) return setError(result.message)
    setSaved(true)
  }

  if (saved) {
    return (
      <div className="flex flex-col gap-3" role="status">
        <p className={noticeOk}>
          <strong>Your seat is saved.</strong> We will use your email only for this session.
        </p>
        <Link className="self-start text-sm font-bold" href="/listens">
          Back to WUWF Listens
        </Link>
      </div>
    )
  }

  return (
    <form className="flex max-w-md flex-col gap-4" noValidate onSubmit={submit}>
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
        <span className={hint}>Used for this session only: to keep your seat and to tell you if anything changes.</span>
      </div>
      {error && (
        <p className={noticeWarn} role="alert">
          {error}
        </p>
      )}
      <button className={cn(buttonDark, 'min-h-12 self-start px-[22px] text-base')} disabled={sending} type="submit">
        {sending ? 'Saving…' : 'Save my seat'}
      </button>
      <PolicyNotice />
    </form>
  )
}
