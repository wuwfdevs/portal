import Link from 'next/link'
import React from 'react'

import type { ListeningQuery } from '@wuwf/portal-contracts'

import { openMeta } from '@/lib/listening/hub'
import { inlineEyebrow } from '@/lib/listening/inline'

import { eyebrow } from './styles'

/**
 * Component A, the invitation: a card that says what is being asked and sends the person to the full question set. It is what an
 * inline slot shows when the question cannot be answered inline (another question is required), and it can stand on its own.
 * It collects nothing, so it carries no IT-04 notice; the page it links to does.
 */
export const Invite: React.FC<{ query: Pick<ListeningQuery, 'title' | 'intro' | 'contextLabel' | 'fromLabel' | 'allowTextAnswers' | 'closesAt' | 'questions'>; href: string }> = ({ query, href }) => (
  <section aria-label="WUWF Listens" className="flex flex-col gap-2.5 rounded-lg border border-rule-strong bg-surface p-6">
    <span className={eyebrow}>{inlineEyebrow(query)}</span>
    <h2 className="font-serif text-[1.5625rem] leading-tight text-ink">{query.title}</h2>
    {query.intro && <p className="text-[0.9375rem] text-ink-2">{query.intro}</p>}
    <span className="text-[0.8125rem] text-ink-3">{openMeta({ questionCount: query.questions.length, allowTextAnswers: query.allowTextAnswers, closesAt: query.closesAt })}</span>
    <div className="mt-1 flex flex-wrap items-center gap-3">
      <Link className="inline-flex min-h-12 items-center rounded-sm bg-wuwf-blue-700 px-[22px] text-[0.9375rem] font-bold text-surface hover:bg-wuwf-blue-600 hover:no-underline" href={href}>
        Take part
      </Link>
      <span className="text-[0.8125rem] text-ink-3">No account needed. Nothing is published automatically.</span>
    </div>
  </section>
)
