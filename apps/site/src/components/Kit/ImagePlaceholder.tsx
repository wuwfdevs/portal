import React from 'react'

import { cn } from '@/utilities/ui'

/**
 * The picture a card shows when its record has none (a story filed without a photo, a show with no cover, an artist with no portrait), so a row of cards keeps one shape and the page does not
 * jump when a picture is added. It fills the frame its parent gives it (the parent sets the shape and the corners) and draws a quiet broadcast mark on the ground's own tint, so it is right on every
 * tone and reads as "no picture yet" and not as a broken image. It is decoration: hidden from assistive technology, never an `<img>` and never a request. Colours are the band's (`--tone-*`) when
 * the card sits in a band and the station's neutrals when it does not.
 */
export function ImagePlaceholder({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('flex size-full items-center justify-center [background-color:var(--tone-tint,var(--color-surface-3))] [color:var(--tone-muted,var(--color-ink-3))]', className)}
      data-placeholder="picture"
    >
      <svg className="size-14 opacity-40" fill="none" focusable="false" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" viewBox="0 0 48 48">
        <circle cx="24" cy="31" fill="currentColor" r="3" stroke="none" />
        <path d="M17 24.5a10 10 0 0 1 14 0" />
        <path d="M11 18.5a18.5 18.5 0 0 1 26 0" />
        <path d="M5.5 12.5a27 27 0 0 1 37 0" />
      </svg>
    </div>
  )
}
