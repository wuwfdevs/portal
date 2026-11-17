import type { Metadata } from 'next'

import { EventsView } from '@/components/Sponsorship/EventsView'
import { loadSponsorship } from '@/lib/sponsorship/load'

// Saving the Sponsorship global refreshes this route (globals/Sponsorship).
export async function generateMetadata(): Promise<Metadata> {
  const { content } = await loadSponsorship()
  return { title: content.events?.hero?.title || undefined, description: content.events?.hero?.body?.split(/\n\s*\n/)[0], alternates: { canonical: '/sponsor/events' } }
}

export default async function Page() {
  const { content, programs } = await loadSponsorship()
  return <EventsView content={content} programs={programs} />
}
