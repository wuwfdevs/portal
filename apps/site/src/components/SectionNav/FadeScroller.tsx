'use client'

import React, { useEffect, useRef, useState } from 'react'

/**
 * A `<nav>` that scrolls sideways and shows that it does: the edge with more beyond it fades out, so a link cut off at the
 * edge reads as "there is more" and not as a mistake. A fade shows only on a side that has something past it, so a row that
 * fits is untouched. Used by `SectionNav`; the links stay server-rendered children.
 */
export const FadeScroller: React.FC<{ label: string; className?: string; children: React.ReactNode }> = ({ label, className, children }) => {
  const ref = useRef<HTMLElement>(null)
  const [more, setMore] = useState({ start: false, end: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // A link to a place on this page whose section drew nothing (a news run with no story left after the lead, a spotlight with no show chosen) goes nowhere: hide it. Without script it stays,
    // which is harmless (an anchor with no target does not move the page), so this is only a tidy-up, never what makes the strip work.
    for (const item of Array.from(el.querySelectorAll<HTMLElement>('li[data-anchor]'))) {
      const id = item.dataset.anchor
      if (id && !document.getElementById(id)) item.hidden = true
    }
    const update = () => {
      const start = el.scrollLeft > 1
      const end = Math.ceil(el.scrollLeft + el.clientWidth) < el.scrollWidth - 1
      setMore((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [])

  const from = more.start ? 'transparent, black 2rem' : 'black, black'
  const to = more.end ? 'black calc(100% - 2.5rem), transparent' : 'black, black'
  const mask = more.start || more.end ? `linear-gradient(to right, ${from}, ${to})` : undefined

  return (
    <nav aria-label={label} className={className} ref={ref} style={{ maskImage: mask, WebkitMaskImage: mask }}>
      {children}
    </nav>
  )
}
