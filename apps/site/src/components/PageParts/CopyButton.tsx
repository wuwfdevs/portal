'use client'

import React, { useEffect, useRef, useState } from 'react'

/**
 * Copies a block of text to the clipboard and says so. The text is on the page already, so a browser that refuses (or has no
 * script) loses only the shortcut; the label never claims a copy that did not happen.
 */
export const CopyButton: React.FC<{ text: string; label: string; copiedLabel: string; failedLabel?: string }> = ({ text, label, copiedLabel, failedLabel }) => {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('failed')
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 4000)
  }

  return (
    <button
      className="inline-flex min-h-11 cursor-pointer items-center rounded-sm border border-rule-strong bg-surface px-4 text-sm font-bold text-wuwf-blue-700 hover:bg-surface-2"
      onClick={copy}
      type="button"
    >
      <span aria-live="polite">{state === 'copied' ? copiedLabel : state === 'failed' ? (failedLabel ?? label) : label}</span>
    </button>
  )
}
