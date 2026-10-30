'use client'

import { usePathname } from 'next/navigation'
import React from 'react'

/**
 * The phone menu: a native <details> disclosure, so it works before any JavaScript and needs no state. Keying
 * it on the path remounts it closed after a navigation, which is all the "close on navigate" it needs.
 */
export const MobileMenu: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname()
  return (
    <details className="group relative lg:hidden" key={pathname}>
      <summary
        aria-label="Menu"
        className="flex size-11 cursor-pointer list-none items-center justify-center rounded-sm hover:bg-surface-2 [&::-webkit-details-marker]:hidden"
      >
        <svg aria-hidden="true" className="group-open:hidden" fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="22">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <svg aria-hidden="true" className="hidden group-open:block" fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="22">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </summary>
      <div className="absolute right-0 top-12 z-20 w-72 rounded-sm border border-rule bg-surface p-2 shadow-3">
        {children}
      </div>
    </details>
  )
}
