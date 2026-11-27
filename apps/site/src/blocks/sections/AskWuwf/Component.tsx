import Link from 'next/link'
import React from 'react'

import type { HubLoad } from '@/lib/listening/load'
import { paragraphs } from '@/lib/page-content'

import { SectionBand } from '../SectionBand'
import { eyebrowClass } from '../parts'
import type { SectionData, SectionProps } from '../types'
import { lightFormCard } from '../listening-parts'

export interface AskWuwfData extends SectionData {
  label?: string | null
  headline?: string | null
  line?: string | null
  jumpLinks?: boolean | null
}

export interface JumpLink {
  label: string
  href: string
  /** A page on this site (a link), not an anchor in this one. */
  page?: boolean
}

/**
 * The links down the page, each only when there is something to go to: a question to answer, an outcome, a table, and always Ask and Host. Pure.
 * Without the hub (it could not be read) only the two that need nothing from it are offered.
 */
export function jumpLinksOf(load: HubLoad | undefined): JumpLink[] {
  const links: JumpLink[] = []
  if (load?.kind === 'ok') {
    const hub = load.hub
    if (hub.open.length > 0) links.push({ label: 'Answer a question →', href: '#now' })
    if (hub.answered.length > 0) links.push({ label: 'See what came of other people’s answers →', href: '#came-of-it' })
  }
  links.push({ label: 'Ask WUWF something →', href: '#ask' })
  return links
}

const linkClass = 'font-semibold [color:var(--tone-accent)]'

/** The Ask WUWF form is a client component that sends through a server action to the Portal; it is loaded when the section draws (the registry is read by the Payload CLI, which cannot load it). */
export type AskForm = React.ComponentType

export function AskWuwfView({ block, load, AskForm }: { block: AskWuwfData; load: HubLoad | undefined; AskForm: AskForm }) {
  const headline = block.headline?.trim()
  if (!headline) return null
  const label = block.label?.trim()
  const lines = paragraphs(block.line)
  const links = block.jumpLinks === false ? [] : jumpLinksOf(load)
  return (
    <SectionBand block={block}>
      <div className="flex flex-wrap items-start gap-x-14 gap-y-10">
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
          {label && (
            <span className={`${eyebrowClass} inline-flex items-center gap-2`}>
              <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="18">
                <rect height="11" rx="3" width="6" x="9" y="3" />
                <path d="M5 11a7 7 0 0014 0M12 18v3" />
              </svg>
              {label}
            </span>
          )}
          <h1 className="max-w-3xl font-serif text-4xl font-bold leading-[1.04] tracking-tight md:text-6xl">{headline}</h1>
          {lines.map((line, i) => (
            <p className="max-w-3xl font-serif text-xl leading-snug [color:var(--tone-muted)]" key={i}>
              {line}
            </p>
          ))}
          {links.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5 text-base">
              {links.map((link) => (
                <li key={link.href}>
                  {link.page ? (
                    <Link className={linkClass} href={link.href}>
                      {link.label}
                    </Link>
                  ) : (
                    <a className={linkClass} href={link.href}>
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={`min-w-0 flex-[1_1_520px] md:max-w-[640px] ${lightFormCard}`}>
          <AskForm />
        </div>
      </div>
    </SectionBand>
  )
}

/** Ask WUWF. Draws nothing without a headline. */
export async function AskWuwfSection({ block, context }: SectionProps<AskWuwfData>) {
  if (!block.headline?.trim()) return null
  const { AskWuwf } = await import('@/components/Listening/AskWuwf')
  return <AskWuwfView AskForm={AskWuwf} block={block} load={context.listeningHub} />
}
