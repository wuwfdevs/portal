'use client'

import { useRouter } from 'next/navigation'
import React, { useId, useState } from 'react'

import type { ListeningHubKitchenCampaign } from '@wuwf/portal-contracts'

import { startKitchenTable } from '@/app/(frontend)/listens/kitchen-actions'
import { PolicyNotice } from '@/components/Account/PolicyNotice'
import { KITCHEN_NAME_MAX, KITCHEN_PLACE_MAX, checkKitchen } from '@/lib/listening/kitchen'

import { buttonDark, field, hint, label, noticeWarn } from './styles'

/**
 * Host your own table. One private table, on this phone, for a campaign WUWF has opened to it: nothing is public, nobody is invited
 * from here, and nothing records until the people at the table have heard the agreement read and said yes. Starting opens the table's
 * own page. `bare` leaves out the title and question when the page already shows them (inside a campaign's band).
 */
export const KitchenTable: React.FC<{ campaign: ListeningHubKitchenCampaign; bare?: boolean }> = ({ campaign, bare = false }) => {
  const id = useId()
  const router = useRouter()
  const [hostName, setHostName] = useState('')
  const [place, setPlace] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    setError(null)
    const checked = checkKitchen({ hostName, place })
    if (!checked.ok) return setError(checked.message)
    setBusy(true)
    const result = await startKitchenTable({ campaignPublicId: campaign.publicId, hostName, place })
    if (!result.ok) {
      setBusy(false)
      return setError(result.message)
    }
    router.push(result.path)
  }

  return (
    <form className="flex max-w-xl flex-col gap-4" onSubmit={submit}>
      {!bare && (
        <div>
          <h3 className="font-serif text-xl font-bold">{campaign.title}</h3>
          <p className="mt-1 font-serif text-lg leading-snug text-ink-2">&ldquo;{campaign.question}&rdquo;</p>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label className={label} htmlFor={`${id}-name`}>
          Your first name (optional)
        </label>
        <input className={field} id={`${id}-name`} maxLength={KITCHEN_NAME_MAX} onChange={(e) => setHostName(e.target.value)} type="text" value={hostName} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className={label} htmlFor={`${id}-place`}>
          Where is your table? (optional)
        </label>
        <input className={field} id={`${id}-place`} maxLength={KITCHEN_PLACE_MAX} onChange={(e) => setPlace(e.target.value)} placeholder="My kitchen" type="text" value={place} />
        <span className={hint}>Only WUWF sees this, beside the recording.</span>
      </div>
      {error && (
        <p className={noticeWarn} role="alert">
          {error}
        </p>
      )}
      <button className={`${buttonDark} min-h-12 self-start px-[22px] text-base`} disabled={busy} type="submit">
        {busy ? 'Starting…' : 'Start my table'}
      </button>
      <p className={hint}>
        You will read a short agreement aloud to everyone at the table, and nothing records until they say yes. You&rsquo;ll need this phone for the whole conversation, plugged in if you can.
      </p>
      <PolicyNotice />
    </form>
  )
}
