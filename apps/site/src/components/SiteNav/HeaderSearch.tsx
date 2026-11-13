'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'

import { MAX_QUERY_LENGTH, searchHref } from '@/lib/search/query'

/**
 * The header's search (board 27). The icon opens a search field right in the header, so a reader searches where they
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
        <form
          action="/search"
          className="flex items-center"
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
          <label className="sr-only" htmlFor="header-search">
            {label}
          </label>
          <input
            className="h-11 w-40 rounded-sm border border-rule-strong bg-surface px-3 text-base text-ink sm:w-64"
            id="header-search"
            maxLength={MAX_QUERY_LENGTH}
            name="q"
            onChange={(e) => setQuery(e.target.value)}
            ref={input}
            type="search"
            value={query}
          />
          <button className="min-h-11 px-3 text-base font-bold text-wuwf-blue-700" type="submit">
            Go
          </button>
        </form>
      )}
      <Link
        aria-expanded={open}
        aria-label={open ? `Close ${label.toLowerCase()}` : label}
        className="flex size-11 items-center justify-center rounded-sm text-ink hover:bg-surface-2"
        href="/search"
        onClick={(e) => {
          e.preventDefault()
          setOpen((o) => !o)
        }}
        ref={trigger}
      >
        <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" width="20">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : (<><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>)}
        </svg>
      </Link>
    </div>
  )
}
