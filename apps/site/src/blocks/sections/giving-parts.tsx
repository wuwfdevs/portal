import React from 'react'

import { cn } from '@/utilities/ui'

/**
 * Small pieces the giving blocks share. Colours come from the tone, as every section's do (`parts.tsx`).
 */

/** Short lines with a mark each, in the tone's own colours (the Give page's level cards and the Other ways page's notes). */
export function ToneList({ items, mark = '✓', className }: { items: readonly string[]; mark?: '✓' | '•'; className?: string }) {
  if (items.length === 0) return null
  return (
    <ul className={cn('m-0 flex list-none flex-col gap-2 p-0 text-base', className)}>
      {items.map((item) => (
        <li className="flex gap-2.5" key={item}>
          <span aria-hidden="true" className="shrink-0 font-bold [color:var(--tone-accent)]">
            {mark}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

/** Admin text that says where a number goes with `{phone}` (or an address with `{email}`); each becomes a link when it can be one, else plain text. */
export function WithTokens({ template, tokens }: { template: string; tokens: Record<string, { text: string | null | undefined; href: string | null }> }) {
  const parts = template.split(/(\{\w+\})/)
  return (
    <>
      {parts.map((part, i) => {
        const key = /^\{(\w+)\}$/.exec(part)?.[1]
        const token = key ? tokens[key] : undefined
        if (!token) return <React.Fragment key={i}>{part}</React.Fragment>
        if (!token.text) return null
        return token.href ? (
          <a className="inline-flex min-h-11 items-center font-bold underline underline-offset-2 [color:var(--tone-accent)]" href={token.href} key={i}>
            {token.text}
          </a>
        ) : (
          <React.Fragment key={i}>{token.text}</React.Fragment>
        )
      })}
    </>
  )
}
