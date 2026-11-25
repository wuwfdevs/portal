'use client'

import React, { useEffect, useRef } from 'react'

import type { PlacementRef } from '@/lib/analytics/events'
import { placementEvent } from '@/lib/analytics/events'
import { analytics } from '@/lib/analytics/dispatch'
import { inView, isDue, NOT_VIEWED, observe, VIEWABLE_MS, VIEWABLE_RATIO, type ViewState } from '@/lib/analytics/viewability'

/**
 * Whether a click on a tile counts. Only a click a person made counts (a keyboard's Enter on the link is one; a script's click is not), and only
 * one on the link: a click on the label strip goes nowhere. A middle click opens the link in a new tab and counts; a right click does not.
 */
export function countsAsClick({ type, button, trusted, onLink }: { type: string; button: number; trusted: boolean; onLink: boolean }): boolean {
  if (!trusted || !onLink) return false
  return type === 'click' || (type === 'auxclick' && button === 1)
}

/**
 * The card around one placement, watched for the three placement events (`lib/analytics`): measurable when it is on the page and the script
 * runs, viewable when it meets the rule in `viewability.ts`, clicked on a real click. It is the tile's own outer element, so it changes nothing
 * about how the tile looks, and it never stops or delays the link. With no reference (a tile with no record id) it is a plain `div`.
 *
 * Everything goes through `analytics.track`, which today sends nothing (no consent is recorded and the sink is a no-op).
 */
export function Tracked({ track, className, children }: { track: PlacementRef | null; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  // The reference as fields, so the effect runs once per placement and not on every render.
  const placementId = track?.placement_id ?? null
  const sponsorId = track?.sponsor_id ?? null
  const zone = track?.zone ?? null
  const kind = track?.kind ?? null

  useEffect(() => {
    const el = ref.current
    if (!el || !placementId || !zone || !kind) return
    const placement: PlacementRef = { placement_id: placementId, sponsor_id: sponsorId, zone, kind }
    analytics.track(placementEvent('sponsor_placement_measurable', placement))
    if (typeof IntersectionObserver === 'undefined') return

    let state: ViewState = NOT_VIEWED
    let ratio = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const now = () => performance.now()
    const pageVisible = () => document.visibilityState === 'visible'

    const check = () => {
      if (!isDue(state, now())) return
      state = { since: state.since, done: true }
      analytics.track(placementEvent('sponsor_placement_viewable', placement))
      stop()
    }
    const update = () => {
      state = observe(state, inView(ratio, pageVisible()), now())
      clearTimeout(timer)
      if (state.since !== null && !state.done) timer = setTimeout(check, Math.max(0, state.since + VIEWABLE_MS - now()))
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) ratio = entry.intersectionRatio
        update()
      },
      { threshold: [0, VIEWABLE_RATIO] },
    )
    const stop = () => {
      clearTimeout(timer)
      observer.disconnect()
      document.removeEventListener('visibilitychange', update)
    }
    observer.observe(el)
    document.addEventListener('visibilitychange', update)
    return stop
  }, [placementId, sponsorId, zone, kind])

  const onClick = (e: React.MouseEvent) => {
    if (!track || !countsAsClick({ type: e.type, button: e.button, trusted: e.nativeEvent.isTrusted, onLink: Boolean((e.target as Element).closest?.('a')) })) return
    analytics.track(placementEvent('sponsor_placement_clicked', track))
  }

  return (
    <div className={className} onAuxClick={track ? onClick : undefined} onClick={track ? onClick : undefined} ref={ref}>
      {children}
    </div>
  )
}
