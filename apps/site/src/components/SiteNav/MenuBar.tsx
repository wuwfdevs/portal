'use client'

import { usePathname } from 'next/navigation'
import React, { useCallback, useEffect, useId, useRef, useState } from 'react'

import { CMSLink } from '@/components/Link'
import type { Header } from '@/payload-types'

type Menu = NonNullable<Header['menus']>[number]

const tab =
  'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-sm px-3 text-base font-semibold text-ink hover:bg-surface-2'

/**
 * The header's menus (board 27). Each is a real button with aria-expanded that opens one panel under the header;
 * opening another closes the first. Escape closes it and returns focus to its button; so does a click outside it or
 * a navigation. On a phone the row of buttons scrolls sideways under the logo, and the panel spans the screen.
 */
export const MenuBar: React.FC<{ menus: Menu[] }> = ({ menus }) => {
  // Keyed on the path, so a navigation remounts the bar with every menu closed.
  const pathname = usePathname()
  return <Bar key={pathname} menus={menus} />
}

const Bar: React.FC<{ menus: Menu[] }> = ({ menus }) => {
  const [open, setOpen] = useState<number | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const baseId = useId()

  const close = useCallback(
    (returnFocus: boolean) => {
      if (returnFocus && open !== null) buttons.current[open]?.focus()
      setOpen(null)
    },
    [open],
  )

  useEffect(() => {
    if (open === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true)
    }
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) close(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open, close])

  const current = open === null ? undefined : menus[open]

  return (
    <div className="order-last -mx-4 w-[calc(100%+2rem)] lg:order-none lg:mx-0 lg:w-auto lg:flex-1" ref={root}>
      <nav aria-label="Primary" className="flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible lg:px-0">
        {menus.map((menu, i) => (
          <button
            aria-controls={`${baseId}-panel-${i}`}
            aria-expanded={open === i}
            className={`${tab} ${open === i ? 'bg-wuwf-blue-100 hover:bg-wuwf-blue-100' : ''}`}
            key={menu.id ?? menu.label}
            onClick={() => setOpen(open === i ? null : i)}
            ref={(el) => {
              buttons.current[i] = el
            }}
            type="button"
          >
            {menu.label}
            <svg aria-hidden="true" className={open === i ? 'rotate-180' : ''} fill="none" height="12" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" width="12">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        ))}
      </nav>

      {current && (
        <div
          className="absolute inset-x-0 top-full z-30 border-t border-rule bg-surface shadow-3"
          id={`${baseId}-panel-${open}`}
        >
          <div className="container flex flex-col gap-6 py-8 md:flex-row md:gap-8">
            <div className="flex flex-col gap-1.5 md:w-64 md:shrink-0">
              <p className="font-serif text-xl font-bold text-ink">{current.heading || current.label}</p>
              {current.blurb && <p className="text-base text-ink-2">{current.blurb}</p>}
            </div>
            <ul className="grid flex-1 grid-cols-1 content-start gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
              {(current.links ?? []).map(({ link, id }) => (
                <li className="border-b border-rule" key={id ?? link.label}>
                  <CMSLink className="flex min-h-11 items-center py-2 text-base font-semibold text-ink hover:text-wuwf-blue-700" {...link} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
