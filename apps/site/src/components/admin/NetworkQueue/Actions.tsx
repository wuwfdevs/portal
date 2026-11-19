'use client'

import { useConfig } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

/**
 * The buttons on one story in the Network queue. They call the collection's own REST endpoint as the signed-in staff member, so the
 * collection's access rules and the status rules (`lib/network/status.ts`) decide what is allowed, not this file.
 *
 * Publishing is not here yet: it needs the converter from a CDS story to a post body (ROADMAP -> Network content), and a post with no
 * body would be a broken page. The button says so instead of hiding.
 */

const button: React.CSSProperties = {
  border: '1px solid var(--theme-elevation-300)',
  background: 'var(--theme-elevation-0)',
  color: 'var(--theme-text)',
  borderRadius: 4,
  padding: '8px 14px',
  minHeight: 44,
  cursor: 'pointer',
  font: 'inherit',
}

export const NetworkQueueActions: React.FC<{ id: number | string; status: 'new' | 'held' | 'gone' }> = ({ id, status }) => {
  const { config } = useConfig()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function move(next: 'new' | 'held' | 'dismissed') {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(`${config.serverURL ?? ''}${config.routes.api}/network-items/${id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { errors?: { message?: string }[] } | null
        setMessage(body?.errors?.[0]?.message ?? 'That did not work.')
        return
      }
      router.refresh()
    } catch {
      setMessage('That did not work. Check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <button type="button" disabled style={{ ...button, opacity: 0.6, cursor: 'not-allowed' }} title="Publishing needs the story converter, which is not built yet.">
        Publish (not available yet)
      </button>
      {status === 'new' ? (
        <button type="button" style={button} disabled={busy} onClick={() => move('held')}>
          Keep for later
        </button>
      ) : null}
      {status === 'held' ? (
        <button type="button" style={button} disabled={busy} onClick={() => move('new')}>
          Put back in the queue
        </button>
      ) : null}
      <button type="button" style={button} disabled={busy} onClick={() => move('dismissed')}>
        Dismiss
      </button>
      {message ? (
        <span role="alert" style={{ color: 'var(--theme-error-500)' }}>
          {message}
        </span>
      ) : null}
    </div>
  )
}
