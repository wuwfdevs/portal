'use client'

import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

import { openTable } from '@/app/(frontend)/listens/table-actions'
import { cn } from '@/utilities/ui'

import { buttonDark, noticeWarn } from './styles'

/**
 * What a table card's QR code opens (board 5f, "join"). The link is single use, so it is redeemed by a press and never when the
 * page loads: a link previewer or a prefetch would otherwise use up a printed card. Redeeming binds this phone to the table.
 */
export const TableLink: React.FC<{ token: string; kitchen?: boolean }> = ({ token, kitchen = false }) => {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const join = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await openTable(token)
    if (!result.ok) {
      setBusy(false)
      setError(result.message)
      return
    }
    router.replace('/listens/session')
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className={noticeWarn} role="alert">
          {error}
        </p>
      )}
      <button className={cn(buttonDark, 'min-h-12 w-full text-base')} disabled={busy} onClick={join} type="button">
        {busy ? 'Opening…' : kitchen ? 'Continue to the agreement' : "I'm facilitating this table"}
      </button>
      {!kitchen && (
        <p className="text-center text-[0.8125rem] text-ink-3">
          Wrong table? Scan the card on your own table. Can&rsquo;t scan? Ask someone at the welcome table for your link.
        </p>
      )}
    </div>
  )
}
