'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'

import { MAX_QUERY_LENGTH, searchHref } from '@/lib/search/query'

/**
 * The header's search (board 27). The icon opens a search field over the header, so a reader searches where they
 * are. It is a real link to /search underneath, so with no JavaScript it still works; with it, the click opens the
 * field instead. Enter goes to the results page. Escape or a navigation closes it and returns focus to the icon.
 */
export const HeaderSearch: React.FC<{ label: string }> = ({ label }) => {
  const pathname = usePathname()
  // Keyed on the path, so a navigation remounts the control closed.
  return <Search key={pathname} label={label} />
}

const Search: React.FC<{ label: string }> = ({ label }) => {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  const close = (returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) trigger.current?.focus()
  }

  return (
    <div className="flex items-center">
      {open && (
        // Laid over the whole header (the header is the positioned ancestor), not placed in its row: a field in the row
        // takes width from the menu and makes its last links wrap. Covering all of it, with no height of its own to keep in
        // step with the header's rows, it never leaves half a menu showing, on a phone or a desktop. The close button and
        // Escape give the header back.
        <form
          action="/search"
          className="absolute inset-0 z-40 bg-surface"
          onKeyDown={(e) => {
            if (e.key === 'Escape') close(true)
          }}
          onSubmit={(e) => {
            e.preventDefault()
            const q = query.trim()
            if (q) router.push(searchHref({ q }))
          }}
          role="search"
        >
          <div className="container flex h-full min-h-16 items-center gap-2">
            <label className="sr-only" htmlFor="header-search">
              {label}
            </label>
            <input
              className="h-11 min-w-0 flex-1 rounded-sm border border-rule-strong bg-surface px-3 text-base text-ink"
              id="header-search"
              maxLength={MAX_QUERY_LENGTH}
              name="q"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stories, shows and video"
              ref={input}
              type="search"
              value={query}
            />
            <button className="min-h-11 shrink-0 rounded-sm bg-wuwf-blue-700 px-4 text-base font-bold text-surface hover:bg-wuwf-blue-600" type="submit">
              Search
            </button>
            <button
              aria-label={`Close ${label.toLowerCase()}`}
              className="flex size-11 shrink-0 items-center justify-center rounded-sm text-ink hover:bg-surface-2"
              onClick={() => close(true)}
              type="button"
            >
              <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" width="20">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </form>
      )}
      <Link
        aria-expanded={open}
        aria-label={label}
        className="flex size-11 items-center justify-center rounded-sm text-ink hover:bg-surface-2"
        href="/search"
        onClick={(e) => {
          e.preventDefault()
          setOpen((o) => !o)
        }}
        ref={trigger}
      >
        <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" width="20">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
      </Link>
    </div>
  )
}
