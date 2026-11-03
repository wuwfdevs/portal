'use client'

import React, { useState } from 'react'

import { cn } from '@/utilities/ui'

/**
 * A placeholder that stands in for content from another site until the reader chooses to load it. The content is passed
 * in as `children` and is not rendered, so no request goes to the other site, and it sets no cookie, until the click.
 * Say who it is from and what loading does; a real button, 44px tall.
 */
export function ClickToLoad({ host, title, children, className }: { host: string; title: string; children: React.ReactNode; className?: string }) {
  const [loaded, setLoaded] = useState(false)
  if (loaded) return <>{children}</>
  return (
    <div className={cn('flex size-full min-h-48 flex-col items-center justify-center gap-3 bg-surface-2 p-6 text-center font-sans', className)}>
      <p className="text-base font-bold text-ink">{title}</p>
      <p className="max-w-md text-sm text-ink-3">
        This is content from {host}. It loads only when you choose, and {host} may see that you visited and may set cookies.
      </p>
      <button
        className="inline-flex min-h-11 items-center rounded-sm bg-wuwf-blue-700 px-5 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wuwf-blue-700"
        onClick={() => setLoaded(true)}
        type="button"
      >
        Load content from {host}
      </button>
    </div>
  )
}
