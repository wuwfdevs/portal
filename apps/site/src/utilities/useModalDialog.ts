'use client'

import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled])'

/**
 * What every modal sheet on the site needs while it is open: the page behind does not scroll, focus starts inside and Tab
 * stays inside, and Escape closes it. `onClose` is also called when the window passes `desktopQuery` (a sheet that is hidden
 * from `lg` up is not closed by hiding it, which would leave the page's scroll locked behind something nobody can see).
 * The caller's `onClose` decides whether focus goes back to the button that opened it.
 */
export function useModalDialog({
  open,
  onClose,
  container,
  initialFocus,
  desktopQuery = '(min-width: 1024px)',
}: {
  open: boolean
  onClose: () => void
  container: RefObject<HTMLElement | null>
  initialFocus?: RefObject<HTMLElement | null>
  desktopQuery?: string
}) {
  // The latest callback, so the listeners below are not rebuilt on every render.
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    const desktop = window.matchMedia(desktopQuery)
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) close.current()
    }
    desktop.addEventListener('change', onChange)
    return () => desktop.removeEventListener('change', onChange)
  }, [desktopQuery])

  useEffect(() => {
    if (!open) return
    initialFocus?.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close.current()
        return
      }
      if (event.key !== 'Tab' || !container.current) return
      const focusable = Array.from(container.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, container, initialFocus])
}
