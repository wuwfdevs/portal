'use client'

import React, { useEffect, useRef, useState } from 'react'

import { ClickToLoad } from '@/components/ClickToLoad'
import { parseSizeMessage, WIDGET_SANDBOX } from '@/lib/widgets'

/**
 * Runs a widget in an isolated frame: no `allow-same-origin` (so it has no access to this site's cookies, storage or
 * page), built from a document the server made, and only after the click. The frame reports its height by message;
 * the message counts only if it came from this frame.
 */
export function WidgetFrame({ doc, host, title, initialHeight }: { doc: string; host: string; title: string; initialHeight: number }) {
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

  return (
    <ClickToLoad className="!min-h-0" host={host} title={title}>
      <iframe
        className="block w-full border-0"
        ref={ref}
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox={WIDGET_SANDBOX}
        srcDoc={doc}
        style={{ height }}
        title={title}
      />
    </ClickToLoad>
  )
}
