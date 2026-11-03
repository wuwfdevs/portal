import type { Metadata } from 'next'
import Link from 'next/link'

import { ChipLink } from '@/components/Events/ChipLink'
import { SubmissionForm } from '@/components/Events/SubmissionForm'
import { loadCategories } from '@/lib/events/load'
import { formTokenFor } from '@/lib/events/secrets'
import { stationToday } from '@/lib/events/schedule'

// Each visit gets its own timing token (see lib/events/abuse), so this page is never cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Submit an event',
  description: 'Send an event to WUWF\'s community calendar. Staff review every submission.',
  alternates: { canonical: '/community-calendar-event-submission' },
}

export default async function SubmitEventPage() {
  const categories = await loadCategories()
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
        <details className="rounded-sm border border-rule p-4">
          <summary className="min-h-11 cursor-pointer py-2 font-serif text-xl font-bold text-ink">Community calendar guidelines</summary>
          <div className="mt-3 flex flex-col gap-4 text-base text-ink-2">
            <p>
              WUWF&rsquo;s Community Calendar is designed for individuals, non-profit organizations, and government entities to announce meetings, fundraisers, and events of interest to the community.
            </p>
            <p>
              Community Calendar may not be used to promote for-profit businesses. If you are a business owner or manager wishing to air your business message on WUWF, please contact WUWF Director of Corporate Support Margaret Marchuk at{' '}
              <a className="font-semibold text-wuwf-blue-700 underline" href="mailto:margaret@wuwf.org">
                margaret@wuwf.org
              </a>{' '}
              or (850) 473-7453 to discuss sponsorship and underwriting opportunities available to businesses.
            </p>
            <p>
              <strong className="text-ink">Submitting community announcements.</strong> The preferred method of receiving announcements is this form. If hand-delivered or mailed to the station, announcements should be typed or neatly written, short and to the point. Phone-in announcements are discouraged. Each announcement should include complete information on the event, who sponsors it, what it is, dates, times and location, and a local phone number and contact person for further information.
            </p>
            <p>
              <strong className="text-ink">Deadlines.</strong> Announcements should be submitted at least five days prior to the event to ensure inclusion in our calendar. Announcements received less than 24 hours prior may not always be included. Weekend events taking place on Mondays should be submitted no later than Thursday afternoon. If an event requires a registration, the deadline date for registration should be conspicuous so that the deadline will be seen, as well as the event.
            </p>
            <p>
              <strong className="text-ink">What&rsquo;s permissible.</strong> Community Calendar is not to be used for profit making ventures. Non-profit organizations may use the calendar for events that charge fees or sell tickets, but may not directly solicit funds. If fees are to be charged, that information should be included in the announcement. If workshops, classes or other events are free to the public and sponsored by a for-profit organization, these events may be included on Community Calendar so long as there is no attempt to influence monetary exchange. (A visit by an author appearing in a bookstore would be acceptable; a book signing party would not.) If workshops, classes or events sponsored by individuals or for-profits are charging a fee or selling tickets, announcements promoting such events will not be permitted on Community Calendar. Fundraising events for non-profit organizations will be permitted with no direct solicitation for funds to be included. These announcements shall be neutral in nature.
            </p>
          </div>
        </details>

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
