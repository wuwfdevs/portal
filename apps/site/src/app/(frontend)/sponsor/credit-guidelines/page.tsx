import type { Metadata } from 'next'

import { GuidelinesView } from '@/components/Sponsorship/GuidelinesView'
import { loadSponsorship } from '@/lib/sponsorship/load'

// Saving the Sponsorship global refreshes this route (globals/Sponsorship).
export async function generateMetadata(): Promise<Metadata> {
  const { content } = await loadSponsorship()
  return { title: content.guidelines?.hero?.title || undefined, description: content.guidelines?.hero?.body?.split(/\n\s*\n/)[0], alternates: { canonical: '/sponsor/credit-guidelines' } }
}

export default async function Page() {
  const { content } = await loadSponsorship()
  return <GuidelinesView content={content} />
}
