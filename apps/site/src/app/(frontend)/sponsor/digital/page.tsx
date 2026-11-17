import type { Metadata } from 'next'

import { DigitalView } from '@/components/Sponsorship/DigitalView'
import { loadSponsorship } from '@/lib/sponsorship/load'

// Saving the Sponsorship global refreshes this route (globals/Sponsorship).
export async function generateMetadata(): Promise<Metadata> {
  const { content } = await loadSponsorship()
  return { title: content.digital?.hero?.title || undefined, description: content.digital?.hero?.body?.split(/\n\s*\n/)[0], alternates: { canonical: '/sponsor/digital' } }
}

export default async function Page() {
  const { content } = await loadSponsorship()
  return <DigitalView content={content} />
}
