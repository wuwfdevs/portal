'use client'

import { useRouter } from 'next/navigation'
import React, { useCallback, useEffect, useRef, useState } from 'react'

/** How often a visible, live page asks whether anything is new. */
export const POLL_MS = 45_000

/**
 * Keeps a live blog current without moving the reader. While the blog is live and this tab is visible it asks a small
 * endpoint of ours (nothing third-party) whether anything changed. If so it says so in words, politely (screen readers
 * announce it without stealing focus), and offers a button: only when the reader chooses does the page refresh, so what
 * they were reading never jumps. A blog that has ended polls nothing. The parent gives this a `key` that changes with the
 * token, so a refresh starts it afresh (no stale "new updates" prompt).
 */
export function LiveRefresh({ slug, token, live }: { slug: string; token: string; live: boolean }) {
  const router = useRouter()
  const [changed, setChanged] = useState(false)
  const [busy, setBusy] = useState(false)
  const known = useRef(token)

  useEffect(() => {
    if (!live) return
    let stopped = false
    const check = async () => {
      if (stopped || document.visibilityState !== 'visible') return
      try {
        const res = await fetch(`/api/live-updates/${encodeURIComponent(slug)}/status`, { cache: 'no-store' })
        if (!res.ok) return
        const body = (await res.json()) as { token?: string }
        if (!stopped && typeof body.token === 'string' && body.token !== known.current) setChanged(true)
      } catch {
        /* offline or a hiccup: try again next time */
      }
    }
    const id = window.setInterval(check, POLL_MS)
    const onVisible = () => void check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [slug, live])

  const show = useCallback(() => {
    setBusy(true)
    router.refresh()
  }, [router])

  return (
    <div aria-live="polite" role="status">
      {changed && (
        <button
          className="my-4 inline-flex min-h-11 items-center rounded-sm bg-wuwf-blue-700 px-5 text-base font-bold text-surface hover:bg-wuwf-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wuwf-blue-700 disabled:opacity-60"
          disabled={busy}
          onClick={show}
          type="button"
        >
          {busy ? 'Loading…' : 'New updates available. Show them'}
        </button>
      )}
    </div>
  )
}
