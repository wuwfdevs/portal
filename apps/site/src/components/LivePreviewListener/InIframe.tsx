'use client'

import React, { useSyncExternalStore } from 'react'

import { LivePreviewListener } from './index'

const never = () => () => {}
const inFrame = (): boolean => {
  try {
    return window.self !== window.top
  } catch {
    return true // a cross-origin parent throws: that is a frame
  }
}

/**
 * The admin's live preview shows a page in an iframe and refreshes it when the editor saves. Pages that are statically cached
 * (the home page, the hubs) must not switch to dynamic rendering for that, and a reader should not pay for the listener, so it
 * is only mounted when the page is actually inside a frame (the admin's preview pane). A page opened on its own never loads it.
 * (Server render and the first client render say "not framed", so there is no mismatch.)
 */
export const LivePreviewInIframe: React.FC = () => {
  const framed = useSyncExternalStore(never, inFrame, () => false)
  return framed ? <LivePreviewListener /> : null
}
