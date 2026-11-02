import React from 'react'

import type { LegacyHtmlBlock as LegacyHtmlBlockProps } from '@/payload-types'

import { sanitizeLegacyHtml } from '@/lib/sanitize'
import { cn } from '@/utilities/ui'

/**
 * The one place this site renders HTML from a string. It only ever renders the sanitizer's output (src/lib/sanitize.ts),
 * which is applied here as well as on save, so a stored record that predates a tightened rule, or was written another
 * way, still cannot reach a reader unfiltered.
 */
export const LegacyHtmlBlock: React.FC<LegacyHtmlBlockProps & { className?: string }> = ({ html, className }) => {
  const safe = sanitizeLegacyHtml(html)
  if (!safe) return null
  return <div className={cn('prose font-serif', className)} dangerouslySetInnerHTML={{ __html: safe }} />
}
