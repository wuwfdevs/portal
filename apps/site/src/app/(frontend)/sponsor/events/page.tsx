import type { Metadata } from 'next'

import { EventsView } from '@/components/Sponsorship/EventsView'
import { loadSponsorship } from '@/lib/sponsorship/load'

export const metadata: Metadata = {
  title: 'Events and programs sponsorship',
  description: 'Partner with RadioLive and the WUWF Book Club, and put your name where WUWF’s community gathers.',
  alternates: { canonical: '/sponsor/events' },
}

// The programs are the Sponsorship global; saving it refreshes this route (globals/Sponsorship).
export default async function EventsSponsorshipPage() {
  const { programs } = await loadSponsorship()
  return <EventsView programs={programs} />
}
