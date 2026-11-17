import type { Metadata } from 'next'

import { OnAirView } from '@/components/Sponsorship/OnAirView'
import { loadSponsorship } from '@/lib/sponsorship/load'

// Saving the Sponsorship global refreshes this route (globals/Sponsorship).
export async function generateMetadata(): Promise<Metadata> {
  const { content } = await loadSponsorship()
  return { title: content.onAir?.hero?.title || undefined, description: content.onAir?.hero?.body?.split(/\n\s*\n/)[0], alternates: { canonical: '/sponsor/on-air' } }
}

export default async function Page() {
  const { content } = await loadSponsorship()
  return <OnAirView content={content} />
}
