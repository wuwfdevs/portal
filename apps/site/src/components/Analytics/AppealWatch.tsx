'use client'

import React, { useEffect, useRef } from 'react'

import { countsAsClick } from '@/components/Placements/Tracked'
import { analytics } from '@/lib/analytics/dispatch'
import type { AppealKind, AppealSurface } from '@/lib/analytics/events'

/** Half the appeal in view counts as shown (the same share as the placement rule, without its one second). */
const SHOWN_RATIO = 0.5

/**
 * The giving events for one appeal: `membership_appeal_shown` once, when half of it is in view in a visible tab, and
 * `membership_appeal_clicked` on a real click on its link (the same rule as a sponsor tile, `countsAsClick`). The appeal's own outer element,
 * so it changes nothing about how it looks and never stops or delays the link.
 */
export function AppealWatch({ kind, surface, className, children }: { kind: AppealKind; surface: AppealSurface; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (document.visibilityState !== 'visible' || !entries.some((e) => e.intersectionRatio >= SHOWN_RATIO)) return
        analytics.track({ name: 'membership_appeal_shown', appeal_kind: kind, surface })
        observer.disconnect()
      },
      { threshold: [SHOWN_RATIO] },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [kind, surface])

  const onClick = (e: React.MouseEvent) => {
    if (!countsAsClick({ type: e.type, button: e.button, trusted: e.nativeEvent.isTrusted, onLink: Boolean((e.target as Element).closest?.('a')) })) return
    analytics.track({ name: 'membership_appeal_clicked', appeal_kind: kind, surface })
  }

  return (
    <div className={className} onAuxClick={onClick} onClick={onClick} ref={ref}>
      {children}
    </div>
  )
}
