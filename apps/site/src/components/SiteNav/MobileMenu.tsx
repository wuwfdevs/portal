'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { useId, useRef, useState } from 'react'

import { CMSLink } from '@/components/Link'
import type { Header } from '@/payload-types'
import { useModalDialog } from '@/utilities/useModalDialog'

type Item = NonNullable<Header['navItems']>[number]

const row =
  'flex min-h-14 w-full items-center justify-between gap-3 border-b border-rule px-4 text-left text-lg font-bold text-ink hover:bg-surface-2 hover:no-underline'
const subLink =
  'flex min-h-12 items-center border-b border-rule py-2 pl-8 pr-4 text-base font-semibold text-ink-2 hover:text-wuwf-blue-700'

/**
 * The header's items on a phone (below `lg`): one Menu button that opens a full-height sheet. A link is a row; a menu is an
 * accordion row (a real button with aria-expanded) that opens its links in place, one at a time. The sheet is a modal
 * dialog: the page behind it does not scroll, Tab stays inside it, Escape or the close button closes it and returns focus to
 * the Menu button, and so does following a link or any navigation. The panel's heading and one-sentence blurb are for the
 * desktop panel only; on a phone the reader came for the links.
 */
export const MobileMenu: React.FC<MobileMenuProps> = (props) => {
  const pathname = usePathname()
  // Keyed on the path, so a navigation remounts the menu closed.
  return <Menu {...props} key={pathname} />
}

type MobileMenuProps = {
  items: Item[]
  /** The header's Search button, when it is shown: on a phone it is a field at the top of the sheet, not an icon in the row. */
  search?: { label: string } | null
  /** The header's Sign in button, when it is shown: a phone's row has no room for it, so it sits at the foot of the sheet. */
  signIn?: { label: string } | null
}

const Menu: React.FC<MobileMenuProps> = ({ items, search, signIn }) => {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<number | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const baseId = useId()

  const close = (returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) trigger.current?.focus()
  }

  useModalDialog({ open, onClose: () => close(true), container: sheet, initialFocus: closeButton })

  return (
    <div className="lg:hidden">
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-sm text-ink hover:bg-surface-2"
        onClick={() => setOpen(true)}
        ref={trigger}
        type="button"
      >
        <svg aria-hidden="true" fill="none" height="22" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" width="22">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <span className="sr-only">Menu</span>
      </button>

      {open && (
        <div aria-label="Menu" aria-modal="true" className="fixed inset-0 z-50 flex flex-col bg-surface" ref={sheet} role="dialog">
          <div className="container flex min-h-16 shrink-0 items-center justify-between border-b border-rule">
            <span className="font-serif text-xl font-bold text-ink">Menu</span>
            <button
              aria-label="Close menu"
              className="flex size-11 items-center justify-center rounded-sm text-ink hover:bg-surface-2"
              onClick={() => close(true)}
              ref={closeButton}
              type="button"
            >
              <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" width="20">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {search && (
            <form action="/search" className="container flex shrink-0 gap-2 border-b border-rule py-3" role="search">
              <label className="sr-only" htmlFor={`${baseId}-search`}>
                {search.label}
              </label>
              <input
                className="h-11 min-w-0 flex-1 rounded-sm border border-rule-strong bg-surface px-3 text-base text-ink"
                id={`${baseId}-search`}
                name="q"
                placeholder="Search stories, shows and video"
                type="search"
              />
              <button className="min-h-11 shrink-0 rounded-sm bg-wuwf-blue-700 px-4 text-base font-bold text-surface hover:bg-wuwf-blue-600" type="submit">
                Search
              </button>
            </form>
          )}

          {/* Following any link inside closes the sheet, including a link to the page the reader is already on. */}
          <nav
            aria-label="Primary"
            className="flex-1 overflow-y-auto overscroll-contain"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('a')) setOpen(false)
            }}
          >
            <ul>
              {items.map((item, i) =>
                item.kind === 'menu' ? (
                  <li key={item.id ?? i}>
                    <button
                      aria-controls={`${baseId}-panel-${i}`}
                      aria-expanded={section === i}
                      className={row}
                      onClick={() => setSection(section === i ? null : i)}
                      type="button"
                    >
                      {item.label}
                      <svg
                        aria-hidden="true"
                        className={section === i ? 'rotate-180' : ''}
                        fill="none"
                        height="16"
                        stroke="currentColor"
                        strokeWidth="3"
                        viewBox="0 0 24 24"
                        width="16"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    {section === i && (
                      <ul className="bg-surface-2" id={`${baseId}-panel-${i}`}>
                        {(item.links ?? []).map(({ link, id }, j) => (
                          <li key={id ?? j}>
                            <CMSLink className={subLink} {...link} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ) : (
                  item.link && (
                    <li key={item.id ?? i}>
                      <CMSLink className={row} {...item.link} />
                    </li>
                  )
                ),
              )}
            </ul>
          </nav>

          {signIn && (
            <div className="shrink-0 border-t border-rule">
              <Link className={row} href="/account" onClick={() => setOpen(false)}>
                {signIn.label}
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
