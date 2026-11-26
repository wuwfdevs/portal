'use client'

import { useEffect, useRef } from 'react'

import { usePlayer } from '@/components/ListenLive/PlayerProvider'
import { analytics } from '@/lib/analytics/dispatch'
import { isRead, scrollDepth } from '@/lib/analytics/engagement'
import type { ContentRef } from '@/lib/analytics/events'

/**
 * The content events for one page: `content_viewed` when it is shown, and `content_engaged` once, when the reader reads it (`engagement.ts`)
 * or presses play while on it. Draws nothing. The catch-all route puts it beside a story, an episode or a show page.
 */
export function ContentSeen({ content }: { content: ContentRef }) {
  const player = usePlayer()
  const playing = player?.status === 'playing'
  const { content_id, content_kind, format, show_id, topic_id } = content
  const onPlay = useRef<() => void>(() => {})
  const wasPlaying = useRef(playing)

  useEffect(() => {
    analytics.track({ name: 'content_viewed', content_id, content_kind, format, show_id, topic_id })
    let engaged = false
    let deepest = 0
    let visibleMs = 0
    let since = document.visibilityState === 'visible' ? performance.now() : null

    const engage = (engagement_kind: 'read' | 'play') => {
      if (engaged) return
      engaged = true
      analytics.track({ name: 'content_engaged', content_id, content_kind, engagement_kind })
      stop()
    }
    const check = () => {
      const now = performance.now()
      const visible = visibleMs + (since === null ? 0 : now - since)
      deepest = Math.max(deepest, scrollDepth(window.scrollY, window.innerHeight, document.documentElement.scrollHeight))
      if (isRead(deepest, visible)) engage('read')
    }
    const onVisibility = () => {
      const now = performance.now()
      if (since !== null) visibleMs += now - since
      since = document.visibilityState === 'visible' ? now : null
      check()
    }
    const timer = window.setInterval(check, 5_000)
    window.addEventListener('scroll', check, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    const stop = () => {
      window.clearInterval(timer)
      window.removeEventListener('scroll', check)
      document.removeEventListener('visibilitychange', onVisibility)
    }
    onPlay.current = () => engage('play')
    return () => {
      stop()
      onPlay.current = () => {}
    }
  }, [content_id, content_kind, format, show_id, topic_id])

  // Pressing play on this page counts as engaging with it; audio already playing when the reader arrived does not.
  useEffect(() => {
    if (playing && !wasPlaying.current) onPlay.current()
    wasPlaying.current = playing
  }, [playing])

  return null
}
