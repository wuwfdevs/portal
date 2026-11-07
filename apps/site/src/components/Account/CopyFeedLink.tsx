'use client'

import React, { useState } from 'react'

/** A feed address with a copy button. Without a script the address can still be selected and copied by hand. */
export function CopyFeedLink({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-sm border border-rule bg-surface-2 p-2">
      <input
        aria-label={label}
        className="min-h-11 min-w-0 flex-1 truncate bg-transparent px-2 font-mono text-sm text-ink-2"
        onFocus={(e) => e.currentTarget.select()}
        readOnly
        value={url}
      />
      <button
        className="inline-flex min-h-11 shrink-0 items-center rounded-sm border border-rule-strong bg-surface px-4 text-sm font-bold text-ink hover:bg-surface-3"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
          } catch {
            setCopied(false)
          }
        }}
        type="button"
      >
        <span aria-live="polite">{copied ? 'Copied' : 'Copy link'}</span>
      </button>
    </div>
  )
}
