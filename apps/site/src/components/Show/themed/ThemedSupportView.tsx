import Link from 'next/link'
import React from 'react'

import { supportHref } from '@/lib/support-link'
import type { StationLevel, ThemedShowData } from '@/lib/shows/themed-load'
import { cn } from '@/utilities/ui'

import { t } from './styles'
import { ThemedShell } from './ThemedShell'

/**
 * A themed show's support page, the membership pathway (board 24). There is no subscription: supporting the show is a
 * WUWF sustaining membership, given on WUWF's own donation form (this page only links there, with the show's attribution
 * code in the address an editor sets). The levels are the station's, from the Support page settings; a show never has a level
 * or a thank-you of its own (owner, 2026-11-06). The show adds only its own words and questions.
 *
 * Not here (ROADMAP → Phase 7): the amount picker (the gift is chosen on WUWF's form), "Sign in to claim your feed",
 * and the three steps to the members' feed (7b to 7d). Nothing on this page promises a feed.
 */
export function ThemedSupportView({ data, levels, membersLevel }: { data: ThemedShowData; levels: StationLevel[]; membersLevel?: string | null }) {
  const { show, theme, totalArchive, totalFieldNotes } = data
  const path = show.path!
  const s = show.showSupport ?? {}
  const donate = supportHref(s.donateUrl)
  const questions = s.questions ?? []

  return (
    <ThemedShell current="support" hasArchive={totalArchive > 0} hasFieldNotes={totalFieldNotes > 0} showPath={path} showTitle={show.title} theme={theme}>
      <header className={cn(t.container, 'flex max-w-[56rem] flex-col gap-5 py-16 md:py-24')}>
        <p className={t.eyebrow}>{s.eyebrow || 'Support the work'}</p>
        <h1 className={cn(t.display, 'text-6xl md:text-8xl')}>{s.heading || `Support ${show.title}`}</h1>
        <p className={cn('text-xl italic leading-relaxed', t.muted)}>
          {s.intro ||
            `${show.title} is made by WUWF Public Media. The way to support the show is the way to support the station: become a sustaining member. Your gift is a tax-deductible donation to WUWF.`}
        </p>
        {donate ? (
          <div className="mt-2 flex flex-col items-start gap-3">
            <a className={t.primary} href={donate}>
              {s.donateLabel || "Give on WUWF's secure form"}
            </a>
            {membersLevel && <p className={cn('text-base', t.muted)}>Members&rsquo; listening on every WUWF original, {show.title} included, comes with {membersLevel}.</p>}
            <p className={cn('text-sm', t.muted)}>You give on WUWF&rsquo;s own donation form. Monthly gifts are WUWF sustaining memberships, which you can change or cancel at any time through WUWF Member Services.</p>
          </div>
        ) : (
          <Link className={cn(t.primary, 'self-start')} href="/support">
            Ways to support WUWF
          </Link>
        )}
      </header>

      {levels.length > 0 && (
        <section aria-labelledby="levels-heading" className={t.container}>
          <h2 className={cn(t.display, 'border-b pb-4 text-4xl', t.rule)} id="levels-heading">
            WUWF membership
          </h2>
          <ul className={cn(t.grid, 'mt-8 md:grid-cols-2 lg:grid-cols-3')}>
            {levels.map((l) => (
              <li className={t.card} key={l.id ?? l.name}>
                {l.amount && <p className={cn(t.label, 'text-base text-(--color-show-accent)')}>{l.amount}</p>}
                <h3 className={cn(t.display, 'text-2xl')}>{l.name}</h3>
                <p className={cn('text-base leading-relaxed', t.muted)}>{l.description}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {questions.length > 0 && (
        <section aria-labelledby="questions-heading" className={cn(t.container, 'mt-16 max-w-[56rem]')}>
          <h2 className={cn(t.display, 'border-b pb-4 text-4xl', t.rule)} id="questions-heading">
            Questions
          </h2>
          <dl className="mt-6 flex flex-col gap-6">
            {questions.map((q) => (
              <div className="flex flex-col gap-2" key={q.id ?? q.question}>
                <dt className={cn(t.display, 'text-2xl')}>{q.question}</dt>
                <dd className={cn('text-base leading-relaxed', t.muted)}>{q.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </ThemedShell>
  )
}
