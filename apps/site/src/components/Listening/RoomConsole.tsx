'use client'

import React, { useCallback, useEffect, useState } from 'react'

import type { ListeningRoom } from '@wuwf/portal-contracts'

import { callRoom, readRoom } from '@/app/(frontend)/listens/room-actions'
import { EVENT_TIME_ZONE } from '@/lib/listening/event'
import { ROOM_POLL_MS, TABLE_STATE_LABEL, canCallLastFive, lastCallSentence, roomSummary, sinceStart, tablesAskingForHelp, tablesOnPrompt } from '@/lib/listening/room'
import { suggestedTimeLabel } from '@/lib/listening/table'
import { cn } from '@/utilities/ui'

import { buttonDark, buttonSecondary, eyebrow, noticeInfo, noticeWarn } from './styles'

function timeOfDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: EVENT_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase().replace(/^(a|p)m$/, '$1.m.')}`
}

/**
 * The organizer's console (board 5g): where every table is, with suggested times, and the three things an organizer may do: move
 * the room's prompt, call the last five minutes, and clear a table's request for a hand. It never shows what was said. It asks the
 * Portal every fifteen seconds while it is open; that is also what tells a table's phone that someone is watching for its request.
 */
export const RoomConsole: React.FC<{ eventPublicId: string; initial: ListeningRoom }> = ({ eventPublicId, initial }) => {
  const [room, setRoom] = useState(initial)
  const [now, setNow] = useState(() => new Date())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmLast, setConfirmLast] = useState(false)

  const poll = useCallback(async () => {
    const result = await readRoom(eventPublicId)
    if (result.ok) {
      setRoom(result.room)
      setError(null)
    } else {
      setError(`${result.message} The room as of the last check is shown.`)
    }
    setNow(new Date())
  }, [eventPublicId])

  useEffect(() => {
    const id = setInterval(poll, ROOM_POLL_MS)
    return () => clearInterval(id)
  }, [poll])

  const act = async (input: { action: 'last-call' | 'prompt' | 'help-clear'; value?: number }) => {
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await callRoom({ eventPublicId, ...input })
    if (result.ok) setRoom(result.room)
    else setError(result.message)
    setNow(new Date())
    setBusy(false)
  }

  const asking = tablesAskingForHelp(room.tables)
  const canCall = canCallLastFive(room)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className={eyebrow}>{room.status === 'live' ? 'Live' : 'Scheduled'}</span>
        <p className="text-base text-ink-2" role="status">
          {roomSummary(room.tables)} · {sinceStart(room.startsAt, room.endsAt, now)}
        </p>
      </div>

      {asking.length > 0 && (
        <div className={cn(noticeWarn, 'flex flex-col gap-2 border-2')} role="alert">
          {asking.map((table) => (
            <div className="flex flex-wrap items-center justify-between gap-3" key={table.number}>
              <span className="font-bold">
                Table {table.number} asked for a hand.
                {table.facilitatorFirstName ? ` ${table.facilitatorFirstName}, facilitating.` : ''}
              </span>
              <button className={cn(buttonSecondary, 'min-h-9 border-ink px-3')} disabled={busy} onClick={() => act({ action: 'help-clear', value: table.number })} type="button">
                On my way: clear it
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className={noticeInfo} role="status">
          {error}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section aria-labelledby="plan-h" className="flex flex-col gap-3">
          <h2 className="font-serif text-xl font-bold" id="plan-h">
            Tonight&rsquo;s plan
          </h2>
          <p className="text-sm text-ink-3">Suggested times. Each table moves on when it&rsquo;s ready; this shows where they are. Choose a prompt to put a note of it on every table&rsquo;s phone.</p>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {room.prompts.map((prompt) => {
              const current = prompt.position === room.currentPromptPosition
              const here = tablesOnPrompt(room.tables, prompt.position)
              const time = suggestedTimeLabel(prompt.suggestedSeconds)
              return (
                <li key={prompt.position}>
                  <button
                    aria-current={current ? 'step' : undefined}
                    className={cn(
                      'flex w-full flex-col gap-0.5 rounded-md border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wuwf-blue-700',
                      current ? 'border-ink bg-surface-2' : 'border-rule-strong bg-surface hover:bg-surface-2',
                    )}
                    disabled={busy || current}
                    onClick={() => act({ action: 'prompt', value: prompt.position })}
                    type="button"
                  >
                    <span className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="font-bold uppercase tracking-wide text-wuwf-blue-700">{current ? 'The room is here' : prompt.kind === 'intro' ? 'Introductions' : prompt.kind === 'question' ? 'The question' : 'Prompt'}</span>
                      <span className="text-ink-3">{[time, here > 0 ? `${here} ${here === 1 ? 'table' : 'tables'} here` : null].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="text-[0.9375rem] leading-snug">{prompt.text}</span>
                  </button>
                </li>
              )
            })}
          </ol>

          <div className="flex flex-col gap-2 rounded-md border border-rule-strong p-3.5">
            <strong className="text-[0.9375rem]">Call last five minutes</strong>
            <p className="m-0 text-sm text-ink-3">{lastCallSentence(room.lastCallAt, timeOfDay)}</p>
            {canCall && !confirmLast && (
              <button className={cn(buttonDark, 'self-start')} disabled={busy} onClick={() => setConfirmLast(true)} type="button">
                Call last five minutes
              </button>
            )}
            {canCall && confirmLast && (
              <div className="flex flex-wrap items-center gap-2.5" role="alertdialog" aria-label="Confirm the last five minutes">
                <span className="text-sm">Tell every table now?</span>
                <button
                  className={buttonDark}
                  disabled={busy}
                  onClick={async () => {
                    await act({ action: 'last-call' })
                    setConfirmLast(false)
                  }}
                  type="button"
                >
                  Yes, call it
                </button>
                <button className={buttonSecondary} onClick={() => setConfirmLast(false)} type="button">
                  Not yet
                </button>
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="tables-h" className="flex flex-col gap-3">
          <h2 className="font-serif text-xl font-bold" id="tables-h">
            Tables
          </h2>
          <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
            {room.tables.map((table) => {
              const prompt = room.prompts.find((p) => p.position === table.promptPosition)
              return (
                <li className={cn('flex flex-col gap-0.5 rounded-md border p-3', table.helpRequested ? 'border-warning-border bg-warning-bg' : 'border-rule-strong')} key={table.number}>
                  <span className="flex items-baseline justify-between gap-2">
                    <strong>Table {table.number}</strong>
                    <span className={cn('text-sm font-semibold', table.state === 'recording' ? 'text-on-air-red' : 'text-ink-2')}>{TABLE_STATE_LABEL[table.state]}</span>
                  </span>
                  <span className="text-sm text-ink-3">
                    {table.facilitatorFirstName ? `${table.facilitatorFirstName} · ` : ''}
                    {table.state === 'recording' || table.state === 'paused' ? (prompt ? `on “${prompt.text}”` : 'recording') : ''}
                  </span>
                  {table.helpRequested && <span className="text-sm font-bold text-warning-fg">Asked for a hand</span>}
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}
