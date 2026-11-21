import type { Metadata } from 'next'
import Link from 'next/link'
import React from 'react'

import { ChipLink } from '@/components/Events/ChipLink'
import { SubmissionForm } from '@/components/Events/SubmissionForm'
import { loadCategories } from '@/lib/events/load'
import { formTokenFor } from '@/lib/events/secrets'
import { stationToday } from '@/lib/events/schedule'
import { calendarGuidelinesOf, linkEmails } from '@/lib/shared-text'
import { getCachedGlobal } from '@/utilities/getGlobals'

// Each visit gets its own timing token (see lib/events/abuse), so this page is never cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Submit an event',
  description: 'Send an event to WUWF\'s community calendar. Staff review every submission.',
  alternates: { canonical: '/community-calendar-event-submission' },
}

export default async function SubmitEventPage() {
  const [categories, sharedText] = await Promise.all([loadCategories(), getCachedGlobal('shared-text', 0)()])
  const guidelines = calendarGuidelinesOf(sharedText?.calendarGuidelines)
  const now = new Date()
  return (
    <div className="pb-20">
      <header className="container flex max-w-[48rem] flex-col gap-3 pt-8 md:pt-12">
        <div>
          <ChipLink href="/community-calendar" tone="teal">
            Community calendar
          </ChipLink>
        </div>
        <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight text-ink md:text-5xl">Submit an event</h1>
        <p className="font-serif text-xl text-ink-2">
          Tell us about an event for the community calendar. Please send it at least five days ahead. Staff review every event before it is listed.
        </p>
      </header>

      <div className="container mt-8 flex max-w-[48rem] flex-col gap-8">
        {guidelines && (
          <details className="rounded-sm border border-rule p-4">
            <summary className="min-h-11 cursor-pointer py-2 font-serif text-xl font-bold text-ink">{guidelines.title}</summary>
            <div className="mt-3 flex flex-col gap-4 text-base text-ink-2">
              {guidelines.paragraphs.map((p, i) => (
                <p key={i}>
                  {p.lead && <strong className="text-ink">{p.lead} </strong>}
                  {linkEmails(p.text).map((part, j) =>
                    part.kind === 'email' ? (
                      <a className="font-semibold text-wuwf-blue-700 underline" href={`mailto:${part.email}`} key={j}>
                        {part.email}
                      </a>
                    ) : (
                      <React.Fragment key={j}>{part.text}</React.Fragment>
                    ),
                  )}
                </p>
              ))}
            </div>
          </details>
        )}

        <aside aria-label="How your information is used" className="rounded-sm bg-surface-2 p-4 text-sm text-ink-2">
          <p>
            <strong className="text-ink">What we do with this form.</strong> We use what you enter to review and list your event, and to contact you with questions about it. Your name and email are seen only by WUWF staff and are never shown on the site. The event itself, as staff edit it, is public if it is listed. To limit repeat submissions we keep a scrambled form of your network address for about two days; it cannot be turned back into the address. You do not need an account.
          </p>
        </aside>

        <SubmissionForm categories={categories.map((c) => ({ slug: c.slug, title: c.title }))} initialToken={formTokenFor(now)} today={stationToday(now)} />

        <Link className="inline-flex min-h-11 items-center self-start font-semibold text-wuwf-blue-700 underline" href="/community-calendar">
          See the community calendar
        </Link>
      </div>
    </div>
  )
}
