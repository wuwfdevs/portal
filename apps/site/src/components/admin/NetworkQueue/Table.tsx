'use client'

import { useConfig } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

import { bulkTargets, rowMoves, type QueueStatus } from '@/lib/network/queue'

/** One story as the table draws it. Plain strings and booleans: the server has already decided what to say. */
export type QueueRow = {
  id: string
  title: string
  teaser: string | null
  status: QueueStatus
  source: string | null
  found: string | null
  image: string | null
  hasAudio: boolean
  original: string | null
  notes: string[]
  detailHref: string
}

type Move = 'held' | 'new' | 'dismissed'

const STATUS_LABEL: Record<QueueStatus, string | null> = { new: null, held: 'Kept for later', gone: 'Removed at the source' }

function Thumbnail({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <span className="wuwf-queue__thumb wuwf-queue__thumb--empty" aria-hidden="true" />
  // The picture stays where NPR hosts it (decided 2026-11-18); the editor's browser loads it, and a picture that will not load leaves a blank.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="wuwf-queue__thumb" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
}

/**
 * The queue's list: tick stories, then keep or dismiss them together, or act on one. Every change goes through the collection's own REST
 * endpoint as the signed-in staff member, so the collection's access rules and `lib/network/status.ts` decide what is allowed; this file
 * only decides what to offer. Dismissing clears a story's words for good, so it always asks first.
 */
export const QueueTable: React.FC<{ rows: QueueRow[] }> = ({ rows }) => {
  const { config } = useConfig()
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string[] | null>(null)

  const chosen = rows.filter((r) => selected.has(r.id))
  const allSelected = rows.length > 0 && chosen.length === rows.length

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  async function apply(ids: string[], to: Move, skipped = 0) {
    setBusy(true)
    setMessage(null)
    setConfirming(null)
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const response = await fetch(`${config.serverURL ?? ''}${config.routes.api}/network-items/${id}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ status: to }),
        })
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { errors?: { message?: string }[] } | null
          throw new Error(body?.errors?.[0]?.message ?? 'That did not work.')
        }
      }),
    )
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    const done = ids.length - failed.length
    const parts = [
      done > 0 ? `${done} ${done === 1 ? 'story' : 'stories'} ${to === 'dismissed' ? 'dismissed' : to === 'held' ? 'kept for later' : 'put back in the queue'}.` : null,
      skipped > 0 ? `${skipped} left as they were: that move does not apply to them.` : null,
      failed.length > 0 ? `${failed.length} did not change: ${(failed[0].reason as Error).message}` : null,
    ].filter(Boolean)
    setMessage(parts.join(' '))
    setSelected(new Set())
    setBusy(false)
    router.refresh()
  }

  const bulk = (to: Move) => {
    const { ids, skipped } = bulkTargets(chosen, to)
    if (to === 'dismissed') return setConfirming(ids)
    if (ids.length === 0) return setMessage('None of the ticked stories can move that way.')
    void apply(ids, to, skipped)
  }

  return (
    <div className="wuwf-queue__list">
      <div className="wuwf-queue__bar" role="toolbar" aria-label="Actions for the ticked stories">
        <label className="wuwf-queue__all">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
            aria-label="Tick every story on this page"
          />
          <span>{chosen.length > 0 ? `${chosen.length} ticked` : 'Tick all'}</span>
        </label>
        {chosen.length > 0 ? (
          <>
            <button type="button" className="wuwf-queue__btn" disabled={busy} onClick={() => bulk('held')}>
              Keep for later
            </button>
            <button type="button" className="wuwf-queue__btn" disabled={busy} onClick={() => bulk('new')}>
              Put back in the queue
            </button>
            <button type="button" className="wuwf-queue__btn wuwf-queue__btn--danger" disabled={busy} onClick={() => bulk('dismissed')}>
              Dismiss…
            </button>
          </>
        ) : null}
      </div>

      {confirming ? (
        <div className="wuwf-queue__confirm" role="alertdialog" aria-labelledby="wuwf-queue-confirm">
          <p id="wuwf-queue-confirm">
            <strong>
              Dismiss {confirming.length} {confirming.length === 1 ? 'story' : 'stories'}?
            </strong>{' '}
            Their words are cleared and they will not come back. This cannot be undone.
          </p>
          <div className="wuwf-queue__confirm-actions">
            <button type="button" className="wuwf-queue__btn wuwf-queue__btn--danger" disabled={busy} onClick={() => void apply(confirming, 'dismissed')}>
              Dismiss
            </button>
            <button type="button" className="wuwf-queue__btn" onClick={() => setConfirming(null)}>
              Keep them
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className="wuwf-queue__message" role="status">
          {message}
        </p>
      ) : null}

      <ul className="wuwf-queue__rows">
        {rows.map((row) => {
          const moves = rowMoves(row.status)
          const label = STATUS_LABEL[row.status]
          return (
            <li key={row.id} className={`wuwf-queue__row${selected.has(row.id) ? ' wuwf-queue__row--ticked' : ''}`}>
              <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} aria-label={`Tick: ${row.title}`} />
              <Thumbnail src={row.image} />
              <div className="wuwf-queue__story">
                <a className="wuwf-queue__title" href={row.detailHref}>
                  {row.title}
                </a>
                <p className="wuwf-queue__meta">
                  {row.source ? <strong>{row.source}</strong> : null}
                  {row.found ? <span>{row.found}</span> : null}
                  {label ? <span className={row.status === 'gone' ? 'wuwf-queue__flag wuwf-queue__flag--warn' : 'wuwf-queue__flag'}>{label}</span> : null}
                  {!row.image ? <span>No picture</span> : null}
                  {row.hasAudio ? <span>Has audio</span> : null}
                  {row.original ? (
                    <a href={row.original} target="_blank" rel="noopener noreferrer">
                      Open the original
                    </a>
                  ) : null}
                </p>
                {row.teaser ? <p className="wuwf-queue__teaser">{row.teaser}</p> : null}
                {row.notes.map((n) => (
                  <p key={n} className="wuwf-queue__note">
                    {n}
                  </p>
                ))}
              </div>
              <div className="wuwf-queue__row-actions">
                {moves.keep ? (
                  <button type="button" className="wuwf-queue__btn" disabled={busy} onClick={() => void apply([row.id], moves.keep!.to)}>
                    {moves.keep.label}
                  </button>
                ) : null}
                <button type="button" className="wuwf-queue__btn wuwf-queue__btn--quiet" disabled={busy} onClick={() => setConfirming([row.id])}>
                  Dismiss…
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
