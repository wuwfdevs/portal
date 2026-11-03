import type { Metadata } from 'next'

import { CalendarView } from '@/components/Events/CalendarView'
import { calendarHref } from '@/lib/events/calendar'
import { loadCalendar } from '@/lib/events/load'

// The list depends on the request (filters, page) and on the clock (an event drops off when it ends), so it is read per
// request. Saving or publishing an event also refreshes this address (hooks).
export const dynamic = 'force-dynamic'

type Args = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function CommunityCalendarPage({ searchParams }: Args) {
  const data = await loadCalendar(await searchParams)
  return <CalendarView categories={data.categories} now={data.now} query={data.query} result={data.result} />
}

export async function generateMetadata({ searchParams }: Args): Promise<Metadata> {
  const { query } = await loadCalendar(await searchParams)
  return {
    title: 'Community calendar',
    description: 'Concerts, meetings, fundraisers and events across the Gulf Coast, listed by WUWF.',
    // A filtered or paged view is its own address and links back to itself; a keyword search is not worth indexing.
    alternates: { canonical: calendarHref(query) },
    ...(query.q ? { robots: { index: false, follow: true } } : {}),
  }
}
