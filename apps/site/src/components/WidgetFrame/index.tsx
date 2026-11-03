'use client'

import React, { useEffect, useRef, useState } from 'react'

import { ClickToLoad } from '@/components/ClickToLoad'
import { parseSizeMessage, WIDGET_SANDBOX } from '@/lib/widgets'

/**
 * Runs a widget in an isolated frame: no `allow-same-origin` (so it has no access to this site's cookies, storage or
 * page), built from a document the server made. It loads by itself when its host is built in or approved, otherwise only
 * after the click. The frame reports its height by message;
 * the message counts only if it came from this frame.
 */
export function WidgetFrame({ doc, host, title, initialHeight, autoLoad = false }: { doc: string; host: string; title: string; initialHeight: number; autoLoad?: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(initialHeight)

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!ref.current || event.source !== ref.current.contentWindow) return
      const h = parseSizeMessage(event.data)
      if (h !== null) setHeight(h)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const frame = (
    <iframe
      className="block w-full border-0"
      loading="lazy"
      ref={ref}
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox={WIDGET_SANDBOX}
      srcDoc={doc}
      style={{ height }}
      title={title}
    />
  )
  // A built-in or approved host loads on its own (still sandboxed); any other waits for the reader.
  if (autoLoad) return frame
  return (
    <ClickToLoad className="!min-h-0" host={host} title={title}>
      {frame}
    </ClickToLoad>
  )
}
