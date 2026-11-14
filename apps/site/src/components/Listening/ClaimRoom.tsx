'use client'

import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

import { claimRoom } from '@/app/(frontend)/listens/room-actions'
import { cn } from '@/utilities/ui'

import { buttonDark, noticeWarn } from './styles'

/**
 * What an organizer's link asks: take charge of this event's room with the account you are signed in as. It is used by a press, and the
 * Portal then records this account as the organizer. Anyone who holds the link can do it, which is why WUWF gives it to one person.
 */
export const ClaimRoom: React.FC<{ token: string; email: string | null }> = ({ token, email }) => {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const claim = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await claimRoom(token)
    if (!result.ok) {
      setBusy(false)
      setError(result.code === 'not_found' ? 'This link is not valid any more. It may have been replaced by a newer one, or the event is over. Ask WUWF for a new link.' : result.message)
      return
    }
    router.replace(`/listens/room/${result.eventPublicId}`)
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <p className="text-base text-ink-2">
        You are signed in{email ? ` as ${email}` : ''}. Opening the room makes this account the organizer of the event: you can follow where every table is, move the room on to the next prompt, and call the last five minutes. You never see what anyone says.
      </p>
      {error && (
        <p className={noticeWarn} role="alert">
          {error}
        </p>
      )}
      <button className={cn(buttonDark, 'min-h-12 self-start px-[22px] text-base')} disabled={busy} onClick={claim} type="button">
        {busy ? 'Opening…' : 'Run this event from this account'}
      </button>
    </div>
  )
}
