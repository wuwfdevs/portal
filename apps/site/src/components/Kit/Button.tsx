import Link from 'next/link'
import React from 'react'

import { buttonClasses, type ButtonSize, type ButtonVariant } from './button'

type Common = { variant?: ButtonVariant; size?: ButtonSize; className?: string; children?: React.ReactNode }

/**
 * A button, or a link drawn as one. With `href` it is a link (`next/link` for this site's own paths, a plain anchor for any other
 * address, which opens with `rel="noopener noreferrer"`); without, a `<button type="button">` unless you say otherwise. Put an icon
 * and a word in `children`; the gap is the button's.
 */
export function Button(props: (Common & { href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'>) | (Common & { href?: undefined } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>)) {
  const { variant, size, className, children, ...rest } = props
  const cls = buttonClasses({ variant, size, className })
  if (typeof rest.href === 'string') {
    const { href, ...anchor } = rest as { href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>
    return href.startsWith('/') && !href.startsWith('//') ? (
      <Link className={cls} href={href} {...anchor}>
        {children}
      </Link>
    ) : (
      <a className={cls} href={href} rel="noopener noreferrer" {...anchor}>
        {children}
      </a>
    )
  }
  const { href: _unused, type = 'button', ...button } = rest as React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined }
  void _unused
  return (
    <button className={cls} type={type} {...button}>
      {children}
    </button>
  )
}
